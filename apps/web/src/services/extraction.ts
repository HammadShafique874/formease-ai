// Real client-side text extraction — web app only.
// PDF: pdfjs-dist (worker via Vite ?url import). Images: tesseract.js, lazy
// dynamic import, English model, progress + 60 s timeout + cancel.
// Nothing here fakes results: failures return a clear error.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface ExtractionProgress {
  stage: "pdf" | "ocr";
  percent: number;
  status: string;
}

export interface ExtractionResult {
  text: string;
  pages?: number;
  source: "pdf" | "image";
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export function validateUploadFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return `Unsupported file type: ${file.type || "unknown"}. Only PDF, JPEG and PNG are accepted.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`;
  }
  return null;
}

export async function extractPdfText(
  file: File,
  onProgress?: (p: ExtractionProgress) => void,
): Promise<ExtractionResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    // Rebuild visual lines: pdfjs returns items in reading order but without
    // newlines, so a new line starts when the y-coordinate changes.
    let pageText = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform?.[5];
      if (typeof y === "number" && lastY !== null && Math.abs(y - lastY) > 2) pageText += "\n";
      if (typeof y === "number") lastY = y;
      pageText += `${item.str} `;
    }
    pageText = pageText.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
    if (pageText) text += `${pageText}\n`;
    onProgress?.({ stage: "pdf", percent: Math.round((pageNo / doc.numPages) * 100), status: `Reading page ${String(pageNo)} of ${String(doc.numPages)}…` });
  }
  await doc.destroy();
  return { text: text.trim(), pages: doc.numPages, source: "pdf" };
}

export interface OcrHandle {
  promise: Promise<ExtractionResult>;
  cancel: () => void;
}

/** Start OCR; call cancel() to stop it. Rejects on timeout (~60 s) or cancel. */
export function extractImageText(
  file: File,
  onProgress?: (p: ExtractionProgress) => void,
): OcrHandle {
  let cancelled = false;
  let terminate: (() => void) | null = null;
  const promise = (async (): Promise<ExtractionResult> => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", undefined, {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          onProgress?.({ stage: "ocr", percent: Math.round(m.progress * 100), status: "Reading text from image…" });
        }
      },
    });
    terminate = () => {
      void worker.terminate();
    };
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("OCR timed out after 60 seconds — the image may be too large or unclear. Paste the form text instead.")), 60000);
    });
    try {
      const result = await Promise.race([worker.recognize(file), timeout]);
      if (cancelled) throw new Error("OCR cancelled.");
      return { text: result.data.text.trim(), source: "image" };
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      terminate?.();
    },
  };
}
