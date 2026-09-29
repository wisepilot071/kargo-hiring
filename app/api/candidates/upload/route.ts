import { NextRequest, NextResponse } from "next/server";
import { access } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db/client";
import { parseBufferToText, SUPPORTED_RESUME_EXTENSIONS } from "@/lib/parsers/document";
import { extractCandidateProfile, extractResumeBullets } from "@/lib/parsers/candidate";
import { buildSanitizedProfile } from "@/lib/scoring/sanitize";
import { detectSharedEmail, combineNotes } from "@/lib/parsers/duplicate-email";
import { evaluateAndBriefCandidate } from "@/lib/scoring/pipeline";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";
import { saveResumeFile } from "@/lib/storage/files";
import type { RoleT } from "@/lib/types";

const APPLICATIONS_DIR = path.join(process.cwd(), "data", "applications");
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — resumes only, no reason to allow more.

function slugBase(fileName: string): string {
  return path
    .basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "candidate";
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function uniqueStoredFileName(originalName: string): Promise<{ storedFileName: string; id: string }> {
  const ext = path.extname(originalName).toLowerCase();
  const base = slugBase(originalName);
  let candidate = `${base}${ext}`;
  let id = base;
  let n = 1;
  // Guards against two different uploads slugifying to the same name, and
  // against re-uploading the same file (which should still get a fresh id
  // rather than silently overwriting someone else's earlier upload). The
  // local-disk existence check is skipped in blob mode (no local dir to
  // check against) — the DB id check alone is still sufficient there.
  const checkDisk = process.env.STORAGE_PROVIDER !== "vercel-blob";
  while ((checkDisk && (await pathExists(path.join(APPLICATIONS_DIR, candidate)))) || (await prisma.candidate.findUnique({ where: { id } }))) {
    n += 1;
    candidate = `${base}-${n}${ext}`;
    id = `${base}-${n}`;
  }
  return { storedFileName: candidate, id };
}

type UploadOutcome = {
  originalName: string;
  status: "OK" | "FAILED" | "REJECTED";
  candidateId?: string;
  name?: string | null;
  reason?: string;
};

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data with one or more 'files' entries." }, { status: 400 });
  }

  const roleRaw = form.get("role");
  const role: RoleT | null = roleRaw === "PM" || roleRaw === "SPM" ? roleRaw : null;

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files were included in the upload." }, { status: 400 });
  }

  const outcomes: UploadOutcome[] = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    if (!SUPPORTED_RESUME_EXTENSIONS.includes(ext)) {
      outcomes.push({ originalName: file.name, status: "REJECTED", reason: `Unsupported file type "${ext || "unknown"}". Use .docx, .pdf, or .txt.` });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      outcomes.push({ originalName: file.name, status: "REJECTED", reason: "File exceeds the 8MB limit." });
      continue;
    }

    try {
      const { storedFileName, id } = await uniqueStoredFileName(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      const doc = await parseBufferToText(buffer, ext);
      const saved = await saveResumeFile(storedFileName, buffer);

      if (doc.status === "FAILED") {
        await prisma.candidate.create({
          data: {
            id,
            appliedRole: null,
            resumeFile: saved.displayName,
            resumeUrl: saved.url,
            resumeText: "",
            parsedProfile: "{}",
            sanitizedProfile: "{}",
            parseStatus: "FAILED",
            parseNotes: doc.reason,
          },
        });
        await recordAudit(id, AUDIT_EVENTS.CANDIDATE_UPLOADED, file.name);
        outcomes.push({ originalName: file.name, status: "FAILED", candidateId: id, reason: doc.reason });
        continue;
      }

      const profile = extractCandidateProfile(doc.text);
      const bullets = extractResumeBullets(doc.text);
      const sanitized = buildSanitizedProfile(profile, role ?? "PM", bullets);
      const roleNote = role ? null : "Role not specified at upload — assign a role on the candidate page to generate a score.";

      await prisma.candidate.create({
        data: {
          id,
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          appliedRole: role,
          resumeFile: saved.displayName,
          resumeUrl: saved.url,
          resumeText: doc.text,
          parsedProfile: JSON.stringify(profile),
          sanitizedProfile: JSON.stringify(sanitized),
          parseStatus: "OK",
          parseNotes: roleNote,
        },
      });

      const sharedEmailWarning = await detectSharedEmail(profile.email, id);
      if (sharedEmailWarning) {
        await prisma.candidate.update({ where: { id }, data: { parseNotes: combineNotes(roleNote, sharedEmailWarning) } });
      }

      await recordAudit(id, AUDIT_EVENTS.CANDIDATE_UPLOADED, file.name);
      await recordAudit(id, AUDIT_EVENTS.CANDIDATE_PARSED, `name=${profile.name ?? "unknown"}`);

      if (role) {
        try {
          await evaluateAndBriefCandidate(id);
        } catch (err) {
          await recordAudit(id, "EVALUATION_FAILED", err instanceof Error ? err.message : "Unknown error");
        }
      }

      outcomes.push({ originalName: file.name, status: "OK", candidateId: id, name: profile.name });
    } catch (err) {
      outcomes.push({ originalName: file.name, status: "FAILED", reason: err instanceof Error ? err.message : "Unknown error while processing this file." });
    }
  }

  return NextResponse.json({ ok: true, results: outcomes });
}
