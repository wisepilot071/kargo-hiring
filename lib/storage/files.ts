import { writeFile as fsWriteFile, readFile as fsReadFile } from "fs/promises";
import path from "path";

const APPLICATIONS_DIR = path.join(process.cwd(), "data", "applications");

export type SavedFile = {
  /** What to store in Candidate.resumeFile — always the display filename. */
  displayName: string;
  /** What to store in Candidate.resumeUrl — set only in blob mode. */
  url: string | null;
};

function isBlobMode(): boolean {
  return process.env.STORAGE_PROVIDER === "vercel-blob";
}

/**
 * Persists an uploaded resume. Local disk in dev (default — no setup
 * needed); Vercel Blob in production, since a deployed serverless function's
 * filesystem is ephemeral and not shared across invocations, so anything
 * written locally there would vanish before the next request could read it.
 */
export async function saveResumeFile(storedFileName: string, buffer: Buffer): Promise<SavedFile> {
  if (isBlobMode()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(storedFileName, buffer, { access: "public", addRandomSuffix: true });
    return { displayName: storedFileName, url: blob.url };
  }
  await fsWriteFile(path.join(APPLICATIONS_DIR, storedFileName), buffer);
  return { displayName: storedFileName, url: null };
}

/**
 * Reads back a previously-saved resume file's bytes, for the download route.
 * Returns null if the file isn't available in this environment (e.g. a
 * candidate seeded locally, in a deploy where local files aren't shipped —
 * see the .gitignore note on why real resumes are never committed).
 */
export async function readResumeFile(candidate: { resumeFile: string; resumeUrl: string | null }): Promise<Buffer | null> {
  if (candidate.resumeUrl) {
    const res = await fetch(candidate.resumeUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await fsReadFile(path.join(APPLICATIONS_DIR, candidate.resumeFile));
  } catch {
    return null;
  }
}
