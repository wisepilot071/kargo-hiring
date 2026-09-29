import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db/client";
import { getAiProvider } from "@/lib/ai/provider";
import { parseDocumentToText, SUPPORTED_RESUME_EXTENSIONS } from "@/lib/parsers/document";
import { extractCandidateProfile, extractResumeBullets } from "@/lib/parsers/candidate";
import { loadHistoricalHires } from "@/lib/parsers/hires";
import { buildSanitizedProfile } from "@/lib/scoring/sanitize";
import { detectSharedEmail, combineNotes } from "@/lib/parsers/duplicate-email";
import { publishRubricVersion } from "@/lib/scoring/versioning";
import { saveCachedSignals } from "@/lib/seed/state";
import { recordAudit, AUDIT_EVENTS } from "@/lib/db/audit";
import { evaluateAndBriefCandidate } from "@/lib/scoring/pipeline";
import type { RoleT } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const JDS_DIR = path.join(DATA_DIR, "jds");
const APPLICATIONS_DIR = path.join(DATA_DIR, "applications");
const HIRES_DIR = path.join(DATA_DIR, "hires");

function slugId(fileName: string): string {
  return path.basename(fileName, path.extname(fileName)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function seedJobDescriptions(ai = getAiProvider()) {
  console.log("\n[1/5] Job descriptions");
  const files = await readdir(JDS_DIR).catch(() => [] as string[]);
  const jds: { role: RoleT; rawText: string }[] = [];

  for (const file of files) {
    const roleGuess = /spm/i.test(file) ? "SPM" : /^pm\./i.test(file) || /\bpm\b/i.test(file) ? "PM" : null;
    if (!roleGuess) {
      console.log(`  ! ${file}: could not determine role (PM/SPM) from filename, skipped`);
      continue;
    }
    const doc = await parseDocumentToText(path.join(JDS_DIR, file));
    if (doc.status === "FAILED") {
      console.log(`  ! ${file}: parsing failed — ${doc.reason}`);
      continue;
    }
    const requirements = await ai.parseJobDescription(roleGuess, doc.text);
    await prisma.jobDescription.upsert({
      where: { role: roleGuess },
      create: { role: roleGuess, sourceFile: file, rawText: doc.text, parsedRequirements: JSON.stringify(requirements) },
      update: { sourceFile: file, rawText: doc.text, parsedRequirements: JSON.stringify(requirements) },
    });
    jds.push({ role: roleGuess, rawText: doc.text });
    console.log(`  ✓ ${roleGuess} — ${requirements.length} requirements extracted from ${file}`);
  }
  return jds;
}

async function seedHistoricalHires(jds: { role: RoleT; rawText: string }[], ai = getAiProvider()) {
  console.log("\n[2/5] Historical hires");
  const { hires, skipped } = await loadHistoricalHires(HIRES_DIR);

  for (const hire of hires) {
    await prisma.historicalHire.upsert({
      where: { id: hire.id },
      create: {
        id: hire.id,
        name: hire.name,
        role: hire.role,
        joinedDate: hire.joinedDate,
        applicationSignals: JSON.stringify(hire.applicationSignals),
        interviewSignals: JSON.stringify(hire.interviewSignals),
        outcomeRating: hire.outcomeRating,
        rawText: hire.rawText,
        sourceFile: hire.sourceFile,
      },
      update: {
        name: hire.name,
        role: hire.role,
        joinedDate: hire.joinedDate,
        applicationSignals: JSON.stringify(hire.applicationSignals),
        interviewSignals: JSON.stringify(hire.interviewSignals),
        outcomeRating: hire.outcomeRating,
        rawText: hire.rawText,
        sourceFile: hire.sourceFile,
      },
    });
  }
  for (const s of skipped) console.log(`  ! ${s.file}: ${s.reason}`);
  console.log(`  ✓ ${hires.length} historical hire record(s) loaded${hires.length === 0 ? " — none found, historical pattern engine will report insufficient evidence" : ""}`);

  const signals = await ai.analyzeHistoricalHires(hires, jds);
  await saveCachedSignals(signals);
  console.log(`  ✓ ${signals.length} historical signal(s) derived (0 is expected/correct when there are 0 hires)`);
  return signals;
}

async function seedRubrics(ai = getAiProvider()) {
  console.log("\n[3/5] Role rubrics");
  const signals = await import("@/lib/seed/state").then((m) => m.loadCachedSignals());

  for (const role of ["PM", "SPM"] as RoleT[]) {
    const jd = await prisma.jobDescription.findUnique({ where: { role } });
    if (!jd) {
      console.log(`  ! ${role}: no job description found, skipping rubric`);
      continue;
    }
    const requirements = JSON.parse(jd.parsedRequirements);
    const roleSignals = signals.filter((s: any) => s.roleRelevance === "both" || s.roleRelevance === role);
    const criteria = await ai.generateRubric(role, requirements, roleSignals);

    const { version, changed } = await publishRubricVersion(role, criteria);
    console.log(
      `  ✓ ${role}: ${criteria.length} rubric criteria (benchmark v${version}${changed ? ", newly published" : ", unchanged from last run"})`
    );
  }
}

async function seedApplications() {
  console.log("\n[4/5] Candidate applications");
  const rolesConfigPath = path.join(APPLICATIONS_DIR, "roles.json");
  let rolesConfig: Record<string, string> = {};
  try {
    rolesConfig = JSON.parse(await readFile(rolesConfigPath, "utf-8"));
  } catch {
    /* no roles.json — every candidate imports unassigned */
  }

  const files = (await readdir(APPLICATIONS_DIR).catch(() => [] as string[])).filter(
    (f) => f !== "roles.json" && f.toLowerCase() !== "readme.md"
  );

  const seededIds: string[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const id = slugId(file);
    seededIds.push(id);

    if (!SUPPORTED_RESUME_EXTENSIONS.includes(ext)) {
      await prisma.candidate.upsert({
        where: { id },
        create: { id, appliedRole: null, resumeFile: file, resumeText: "", parsedProfile: "{}", sanitizedProfile: "{}", parseStatus: "FAILED", parseNotes: `Unsupported file type: ${ext}` },
        update: { parseStatus: "FAILED", parseNotes: `Unsupported file type: ${ext}` },
      });
      console.log(`  ! ${file}: unsupported file type`);
      continue;
    }

    const doc = await parseDocumentToText(path.join(APPLICATIONS_DIR, file));
    if (doc.status === "FAILED") {
      await prisma.candidate.upsert({
        where: { id },
        create: { id, appliedRole: null, resumeFile: file, resumeText: "", parsedProfile: "{}", sanitizedProfile: "{}", parseStatus: "FAILED", parseNotes: doc.reason },
        update: { parseStatus: "FAILED", parseNotes: doc.reason },
      });
      await recordAudit(id, AUDIT_EVENTS.CANDIDATE_UPLOADED, file);
      console.log(`  ! ${file}: parsing failed — ${doc.reason}`);
      continue;
    }

    const profile = extractCandidateProfile(doc.text);
    const bullets = extractResumeBullets(doc.text);
    const rolesJsonRole = (rolesConfig[file] as RoleT | undefined) ?? null;

    // A role the founder assigned live through the dashboard (or a prior
    // seed run's roles.json) must never be silently reset back to
    // unassigned by a routine re-seed — that leaves a stale score,
    // decision, and email history sitting under a candidate the UI now
    // shows as "Unassigned" (found in QA: exactly this happened to a
    // candidate who'd already been scored, decided on, and emailed).
    // roles.json only supplies a DEFAULT for a candidate that has none yet.
    const existing = await prisma.candidate.findUnique({ where: { id }, select: { appliedRole: true } });
    const assignedRole = (existing?.appliedRole as RoleT | undefined) ?? rolesJsonRole;

    const sanitized = buildSanitizedProfile(profile, assignedRole ?? "PM", bullets);
    const roleNote = assignedRole ? null : "Role not specified in seed metadata — assign a role in the dashboard to generate a score.";

    await prisma.candidate.upsert({
      where: { id },
      create: {
        id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        appliedRole: assignedRole,
        resumeFile: file,
        resumeText: doc.text,
        parsedProfile: JSON.stringify(profile),
        sanitizedProfile: JSON.stringify(sanitized),
        parseStatus: "OK",
        parseNotes: roleNote,
      },
      update: {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        appliedRole: assignedRole,
        resumeFile: file,
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

    await recordAudit(id, AUDIT_EVENTS.CANDIDATE_UPLOADED, file);
    await recordAudit(id, AUDIT_EVENTS.CANDIDATE_PARSED, `name=${profile.name ?? "unknown"}`);
    console.log(`  ✓ ${file} → ${id}${assignedRole ? ` (role: ${assignedRole})` : " (role unassigned)"}${sharedEmailWarning ? " [shared-email flagged]" : ""}`);
  }

  return seededIds;
}

async function scoreAssignedCandidates() {
  console.log("\n[5/5] Scoring candidates with an assigned role");
  const candidates = await prisma.candidate.findMany({ where: { appliedRole: { not: null }, parseStatus: "OK" } });
  for (const c of candidates) {
    // One candidate's evaluation failing (a bad AI response, an edge case in
    // scoring) must not abort the whole seed run and leave every candidate
    // after it unscored — found in QA: this loop had no per-candidate
    // isolation at all, unlike the equivalent upload-route code path.
    try {
      await evaluateAndBriefCandidate(c.id);
      console.log(`  ✓ scored ${c.resumeFile}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      await recordAudit(c.id, "EVALUATION_FAILED", reason);
      console.log(`  ! ${c.resumeFile}: evaluation failed — ${reason}`);
    }
  }
  if (candidates.length === 0) {
    console.log("  (no candidates have an assigned role yet — nothing to score)");
  }
}

async function main() {
  console.log(`Kargo hiring seed — AI provider: ${getAiProvider().name}`);
  const jds = await seedJobDescriptions();
  await seedHistoricalHires(jds);
  await seedRubrics();
  await seedApplications();
  await scoreAssignedCandidates();
  console.log("\nSeed complete. Run again any time — it will not create duplicates.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
