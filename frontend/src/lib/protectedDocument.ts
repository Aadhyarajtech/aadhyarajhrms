import { getErrorMessage } from "@/lib/api";

type ToastVariant = "success" | "error" | "info";
type ShowToast = (message: string, variant?: ToastVariant) => void;

/**
 * Opens a same-origin viewer shell for a private employee document.
 * The wrapper deters casual copying; backend authorization remains the
 * security boundary and native browser/OS screenshot controls cannot be blocked.
 */
export function openPrivateDocument(
  id: string,
  fileName: string | null | undefined,
  showToast: ShowToast,
  _canDownload = false,
) {
  if (!id) {
    showToast("This document does not have a valid document ID.", "error");
    return;
  }

  try {
    const token = localStorage.getItem("aadhyaraj_token");
    const rawBase = import.meta.env.VITE_API_URL || "/api";
    const baseUrl = rawBase.startsWith("http")
      ? rawBase
      : `${window.location.origin}${rawBase}`;
    const documentUrl = new URL(
      `${baseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(id)}/preview`,
    );
    if (token) documentUrl.searchParams.set("token", token);
    if (/\.pdf$/i.test(String(fileName ?? ""))) {
      documentUrl.hash = "toolbar=0&navpanes=0&scrollbar=1";
    }

    const viewer = window.open("about:blank", "_blank");
    if (!viewer) {
      showToast("Please allow popups to preview this document.", "info");
      return;
    }

    viewer.opener = null;
    const title = String(fileName || "Document").replace(/[<>"&]/g, "");
    const escapedUrl = documentUrl.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");

    viewer.document.open();
    viewer.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
      html,body{height:100%;margin:0;background:#202124;color:#fff;font:14px system-ui,sans-serif;overflow:hidden}
      .bar{height:40px;display:flex;align-items:center;padding:0 14px;background:#303134;box-sizing:border-box}
      .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      iframe{display:block;width:100%;height:calc(100% - 40px);border:0;background:#fff}
      body.protected{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    </style></head><body class="protected"><div class="bar"><span class="name">${title}</span></div><iframe title="Protected document preview" src="${escapedUrl}" referrerpolicy="no-referrer"></iframe>
    <script>
      (function(){
        const block=e=>{e.preventDefault();e.stopPropagation();};
        ["contextmenu","copy","cut","dragstart","selectstart"].forEach(n=>document.addEventListener(n,block,true));
        document.addEventListener("keydown",function(e){
          const k=String(e.key||"").toLowerCase();
          const mod=e.ctrlKey||e.metaKey;
          if(mod && ["c","x","a","s","p","u"].includes(k)){block(e);return;}
          if(e.key==="PrintScreen" || (e.ctrlKey && e.shiftKey && ["i","j","c"].includes(k))){block(e);}
        },true);
        document.addEventListener("beforeprint",block,true);
      })();
    </script></body></html>`);
    viewer.document.close();
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : getErrorMessage(err);
    showToast(message, "error");
  }
}
