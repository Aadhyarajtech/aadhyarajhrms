import { api, getErrorMessage } from "@/lib/api";

type ToastVariant = "success" | "error" | "info";
type ShowToast = (message: string, variant?: ToastVariant) => void;

/**
 * Opens a dedicated, controlled document viewer. PDF files are painted to
 * canvas with PDF.js (no native browser PDF toolbar and no selectable text
 * layer). Restrictions are attached only to the opened viewer, never to the
 * HRMS Documents page.
 *
 * PDF.js is loaded from cdnjs because this project does not currently bundle
 * pdfjs-dist. For production, vendor/bundle pdfjs-dist locally to avoid a CDN
 * dependency. Client-side restrictions deter casual copying; they are not a
 * security boundary against screenshots, DevTools, or OS-level capture.
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

  // Open synchronously inside the click handler so popup blockers do not stop it.
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
*{box-sizing:border-box}html,body{height:100%;margin:0;background:#202124;color:#fff;font:14px system-ui,-apple-system,sans-serif}
body{display:flex;flex-direction:column;overflow:hidden}.bar{height:44px;flex:0 0 44px;display:flex;align-items:center;padding:0 16px;background:#303134;border-bottom:1px solid #444}
.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.status{padding:24px;color:#222;background:#fff;flex:1;overflow:auto}
#documentSurface{flex:1;min-height:0;overflow:auto;background:#525659;padding:18px 12px;overscroll-behavior:contain}
.pdf-page{margin:0 auto 18px;background:white;box-shadow:0 2px 8px #0008;max-width:100%;width:max-content;pointer-events:none;user-select:none;-webkit-user-select:none}
.pdf-page canvas{display:block;max-width:100%;height:auto;pointer-events:none;user-select:none;-webkit-user-select:none}
#imagePreview{display:block;max-width:100%;height:auto;margin:0 auto;pointer-events:none;user-select:none;-webkit-user-select:none}
#textPreview{white-space:pre-wrap;overflow-wrap:anywhere;background:white;color:#222;max-width:1000px;margin:0 auto;padding:24px;min-height:100%;user-select:none;-webkit-user-select:none}
#error{color:#8b1e1e;background:#fff;padding:24px;white-space:pre-wrap}
/* Keep the preview content out of browser print output. The browser may still
   open its print dialog, but this controlled viewer should print a blank page. */
@media print{html,body,body *{display:none!important;visibility:hidden!important}html,body{background:#fff!important}}
</style></head><body>
<div class="bar"><span class="name"></span></div>
<div class="status" id="status" role="status">Loading secure document preview…</div>
</body></html>`);
  viewer.document.close();
  const titleNode = viewer.document.querySelector(".name");
  if (titleNode) titleNode.textContent = title;

  let disposed = false;
  let objectUrl: string | undefined;
  const cleanup = () => {
    disposed = true;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
    }
  };
  viewer.addEventListener("beforeunload", cleanup, { once: true });

  const preventAction = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
  };
  const preventShortcut = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const modified = event.ctrlKey || event.metaKey;
    const blocked = modified && ["a", "c", "x", "v", "p", "s", "u"].includes(key);
    const blockedPrintVariant = modified && event.shiftKey && key === "p";
    const blockedFunctionKey = event.key === "F12" || event.key === "PrintScreen";
    if (blocked || blockedPrintVariant || blockedFunctionKey) preventAction(event);
  };

  // Intercept interaction only over the rendered document area. Leave the
  // title bar and browser/window controls alone. Wheel/keyboard scrolling work.
  const blockSurfaceEvents = (surface: HTMLElement) => {
    ["click", "dblclick", "auxclick", "mousedown", "mouseup", "pointerdown", "pointerup",
      "contextmenu", "dragstart", "drag", "drop", "selectstart", "copy", "cut", "paste"]
      .forEach((name) => surface.addEventListener(name, preventAction, true));
    surface.addEventListener("keydown", preventShortcut, true);
    surface.addEventListener("touchmove", (event) => {
      // Preserve ordinary touch scrolling; prevent multi-touch gestures.
      if ((event as TouchEvent).touches.length > 1) preventAction(event);
    }, { capture: true, passive: false });
  };

  // Install blockers at the preview-window and document capture phases. This
  // catches right-clicks even when the pointer is over a page canvas or image.
  viewer.addEventListener("contextmenu", preventAction, true);
  viewer.document.addEventListener("contextmenu", preventAction, true);
  viewer.addEventListener("keydown", preventShortcut, true);
  viewer.document.addEventListener("keydown", preventShortcut, true);
  viewer.addEventListener("beforeprint", preventAction, true);
  viewer.document.addEventListener("beforeprint", preventAction, true);
  // Suppress scripted printing. Browser menu printing cannot be reliably
  // disabled by web code; @media print above hides the rendered document.
  try { viewer.print = () => undefined; } catch { /* Browser may expose a read-only method. */ }

  void (async () => {
    try {
      const response = await api.get<Blob>(
        `/documents/${encodeURIComponent(id)}/preview`,
        { responseType: "blob", headers: { "Cache-Control": "no-store" } },
      );
      if (disposed || viewer.closed) return;
      const blob = response.data;
      if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The server returned an empty document.");

      const status = viewer.document.getElementById("status");
      if (!status) return;
      const surface = viewer.document.createElement("div");
      surface.id = "documentSurface";
      surface.setAttribute("aria-label", "Protected document preview");
      surface.setAttribute("draggable", "false");
      status.replaceWith(surface);
      blockSurfaceEvents(surface);

      const name = String(fileName || "");
      const isPdf = blob.type.toLowerCase().includes("pdf") || /\.pdf$/i.test(name);
      const isImage = blob.type.toLowerCase().startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
      const isText = blob.type.toLowerCase().startsWith("text/") || /\.(txt|csv|log)$/i.test(name);

      if (isPdf) {
        // PDF.js renders pages into canvases, avoiding the native PDF plugin/toolbar.
        const version = "3.11.174";
        const script = viewer.document.createElement("script");
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.min.js`;
        script.crossOrigin = "anonymous";
        script.onload = async () => {
          try {
            if (disposed || viewer.closed) return;
            const pdfjs = (viewer as unknown as { pdfjsLib?: {
              GlobalWorkerOptions: { workerSrc: string };
              getDocument: (options: { data: Uint8Array }) => { promise: Promise<{
                numPages: number;
                getPage: (page: number) => Promise<{
                  getViewport: (options: { scale: number }) => { width: number; height: number };
                  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
                }>;
              }> };
            } }).pdfjsLib;
            if (!pdfjs) throw new Error("PDF viewer library did not load. Check network access and try again.");
            pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
            const data = new Uint8Array(await blob.arrayBuffer());
            const pdf = await pdfjs.getDocument({ data }).promise;
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              if (disposed || viewer.closed) return;
              const page = await pdf.getPage(pageNumber);
              const viewport = page.getViewport({ scale: 1.35 });
              const wrapper = viewer.document.createElement("div");
              wrapper.className = "pdf-page";
              wrapper.setAttribute("aria-label", `Page ${pageNumber}`);
              const canvas = viewer.document.createElement("canvas");
              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);
              canvas.style.width = `${viewport.width}px`;
              canvas.style.height = `${viewport.height}px`;
              wrapper.appendChild(canvas);
              surface.appendChild(wrapper);
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Your browser could not render this PDF page.");
              await page.render({ canvasContext: context, viewport }).promise;
            }
          } catch (error) {
            if (!disposed && !viewer.closed) {
              surface.replaceChildren();
              const message = viewer.document.createElement("div");
              message.id = "error";
              message.textContent = `Unable to render this PDF in protected preview. ${error instanceof Error ? error.message : "Please try again."}`;
              surface.appendChild(message);
            }
          }
        };
        script.onerror = () => {
          if (!disposed && !viewer.closed) {
            surface.textContent = "Unable to load the protected PDF viewer. Check your network connection and try again.";
          }
        };
        viewer.document.head.appendChild(script);
      } else if (isImage) {
        objectUrl = URL.createObjectURL(blob);
        const image = viewer.document.createElement("img");
        image.id = "imagePreview";
        image.alt = "Protected document preview";
        image.draggable = false;
        image.src = objectUrl;
        surface.appendChild(image);
      } else if (isText) {
        const text = viewer.document.createElement("pre");
        text.id = "textPreview";
        text.textContent = await blob.text();
        surface.appendChild(text);
      } else {
        const message = viewer.document.createElement("div");
        message.id = "error";
        message.textContent = "This file type cannot be displayed in the protected viewer. Please upload or convert it to PDF for controlled preview.";
        surface.appendChild(message);
      }
    } catch (err) {
      if (disposed || viewer.closed) return;
      let message = getErrorMessage(err, "Unable to load this document preview.");
      const responseData = (err as { response?: { data?: unknown } })?.response?.data;
      if (responseData instanceof Blob && responseData.type.includes("json")) {
        try {
          const body = JSON.parse(await responseData.text()) as { error?: { message?: string }; message?: string };
          message = body.error?.message || body.message || message;
        } catch { /* Keep the original API error. */ }
      }
      const status = viewer.document.getElementById("status");
      if (status) status.textContent = `${message} Close this tab and try again. If the problem continues, contact your HRMS administrator.`;
      showToast(message, "error");
    }
  })();
}
