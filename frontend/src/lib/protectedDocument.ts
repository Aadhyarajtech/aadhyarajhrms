import { api, getErrorMessage } from "@/lib/api";

type ToastVariant = "success" | "error" | "info";
type ShowToast = (message: string, variant?: ToastVariant) => void;

/**
 * Opens a same-origin viewer for a private employee document.
 * The document is fetched through the shared Axios client so the existing
 * /api routing and Authorization interceptor are used consistently in Vite
 * development and in the Vercel deployment.
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

  // Open synchronously from the click handler to avoid popup blockers.
  const viewer = window.open("about:blank", "_blank");
  if (!viewer) {
    showToast("Please allow popups to preview this document.", "info");
    return;
  }
  viewer.opener = null;

  const title = String(fileName || "Document").replace(/[<>"&]/g, "");
  viewer.document.open();
  viewer.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
html,body{height:100%;margin:0;background:#202124;color:#fff;font:14px system-ui,sans-serif;overflow:hidden}
.bar{height:40px;display:flex;align-items:center;padding:0 14px;background:#303134;box-sizing:border-box}
.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status{padding:24px;color:#222;background:#fff;height:calc(100% - 40px);box-sizing:border-box;overflow:auto}
iframe{display:block;width:100%;height:calc(100% - 40px);border:0;background:#fff}
</style></head><body>
<div class="bar"><span class="name"></span></div>
<div class="status" role="status">Loading secure document preview…</div>
</body></html>`);
  viewer.document.close();
  const titleNode = viewer.document.querySelector(".name");
  if (titleNode) titleNode.textContent = title;

  let objectUrl: string | undefined;
  let disposed = false;
  const cleanup = () => {
    disposed = true;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    }
  };
  viewer.addEventListener("beforeunload", cleanup, { once: true });

  void (async () => {
    try {
      // Use the centralized API client: it adds the Bearer token and uses
      // baseURL=/api, which works with the Vite proxy locally and Vercel's
      // /api rewrite in production. Do not build a URL from VITE_API_URL here.
      const response = await api.get<Blob>(
        `/documents/${encodeURIComponent(id)}/preview`,
        { responseType: "blob", headers: { "Cache-Control": "no-store" } },
      );

      if (disposed || viewer.closed) return;
      const blob = response.data;
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("The server returned an empty document.");
      }

      objectUrl = URL.createObjectURL(blob);
      const iframe = viewer.document.createElement("iframe");
      iframe.title = "Protected document preview";
      iframe.src = objectUrl + (/\.pdf$/i.test(String(fileName ?? ""))
        ? "#toolbar=0&navpanes=0&scrollbar=1"
        : "");
      const status = viewer.document.querySelector(".status");
      if (status) status.replaceWith(iframe);
    } catch (err) {
      if (disposed || viewer.closed) return;

      let message = getErrorMessage(err, "Unable to load this document preview.");
      // Axios may receive a JSON error body as a Blob because responseType is
      // blob. Decode it so the user sees the server's actual error message.
      const responseData = (err as { response?: { data?: unknown } })?.response?.data;
      if (responseData instanceof Blob && responseData.type.includes("json")) {
        try {
          const body = JSON.parse(await responseData.text()) as {
            error?: { message?: string };
            message?: string;
          };
          message = body.error?.message || body.message || message;
        } catch {
          // Keep the original Axios error message.
        }
      }

      const status = viewer.document.querySelector(".status");
      if (status) {
        status.textContent = `${message} Close this tab and try again. If the problem continues, contact your HRMS administrator.`;
      }
      showToast(message, "error");
    }
  })();
}
