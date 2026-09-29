import { readFile } from "fs/promises";
import path from "path";

export type DocumentParseResult =
  | { status: "OK"; text: string }
  | { status: "FAILED"; text: ""; reason: string };

/**
 * Extracts raw text from resume bytes already in memory. Supports .docx,
 * .pdf, .txt. Never throws — callers get a typed result so a bad file
 * degrades to "manual review required" instead of crashing the
 * seed/import run. Buffer-based (not path-based) so it works identically
 * whether the bytes came from local disk or were just received over an
 * upload request and never touched disk at all (e.g. serverless + blob
 * storage, where there may be no local path to read from).
 */
export async function parseBufferToText(buffer: Buffer, ext: string): Promise<DocumentParseResult> {
  const extLower = ext.toLowerCase();
  try {
    if (extLower === ".docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      if (!text) return { status: "FAILED", text: "", reason: "DOCX contained no extractable text" };
      return { status: "OK", text };
    }

    if (extLower === ".pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      const text = result.text.trim();
      if (!text) return { status: "FAILED", text: "", reason: "PDF contained no extractable text (possibly scanned/image-only)" };
      return { status: "OK", text };
    }

    if (extLower === ".txt") {
      const text = buffer.toString("utf-8").trim();
      if (!text) return { status: "FAILED", text: "", reason: "TXT file was empty" };
      return { status: "OK", text };
    }

    return { status: "FAILED", text: "", reason: `Unsupported file type: ${extLower || "(no extension)"}` };
  } catch (err) {
    return {
      status: "FAILED",
      text: "",
      reason: err instanceof Error ? err.message : "Unknown parsing error",
    };
  }
}

/** Same as parseBufferToText, but reads the bytes from a local file path first (seed script, dev-only local reads). */
export async function parseDocumentToText(filePath: string): Promise<DocumentParseResult> {
  const ext = path.extname(filePath).toLowerCase();
  try {
    const buffer = await readFile(filePath);
    return parseBufferToText(buffer, ext);
  } catch (err) {
    return {
      status: "FAILED",
      text: "",
      reason: err instanceof Error ? err.message : "Unknown parsing error",
    };
  }
}

export const SUPPORTED_RESUME_EXTENSIONS = [".docx", ".pdf", ".txt"];
