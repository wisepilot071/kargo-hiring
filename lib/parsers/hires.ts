import { readdir, readFile } from "fs/promises";
import path from "path";
import { HistoricalHireRecordSchema, type HistoricalHireRecord } from "@/lib/types";
import { parseDocumentToText } from "@/lib/parsers/document";

function slugId(fileName: string): string {
  return path.basename(fileName, path.extname(fileName)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function parseFreeTextHire(fileName: string, text: string): HistoricalHireRecord | null {
  const lines = text.split("\n").map((l) => l.trim());
  const roleLine = lines.find((l) => /^role\s*:/i.test(l));
  const outcomeLine = lines.find((l) => /^outcome\s*:/i.test(l));
  const nameLine = lines.find((l) => /^name\s*:/i.test(l)) ?? lines.find(Boolean);

  if (!roleLine || !outcomeLine) return null;

  const role = /spm|senior/i.test(roleLine) ? "SPM" : "PM";
  const outcomeRaw = outcomeLine.split(":").slice(1).join(":").trim();
  const outcome = ["Exceeds Expectations", "Meets Expectations", "Below Expectations"].find(
    (o) => outcomeRaw.toLowerCase().includes(o.toLowerCase())
  );
  if (!outcome) return null;

  const bulletLines = lines.filter((l) => /^[—\-–•▪●·]/.test(l)).map((l) => l.replace(/^[—\-–•▪●·]\s*/, ""));
  const appIdx = lines.findIndex((l) => /application/i.test(l));
  const intIdx = lines.findIndex((l) => /interview/i.test(l));

  let applicationSignals = bulletLines;
  let interviewSignals: string[] = [];
  if (appIdx !== -1 && intIdx !== -1 && intIdx > appIdx) {
    applicationSignals = lines
      .slice(appIdx + 1, intIdx)
      .filter((l) => /^[—\-–•▪●·]/.test(l))
      .map((l) => l.replace(/^[—\-–•▪●·]\s*/, ""));
    interviewSignals = lines
      .slice(intIdx + 1)
      .filter((l) => /^[—\-–•▪●·]/.test(l))
      .map((l) => l.replace(/^[—\-–•▪●·]\s*/, ""));
  }

  return HistoricalHireRecordSchema.parse({
    id: slugId(fileName),
    name: nameLine?.replace(/^name\s*:/i, "").trim() || slugId(fileName),
    role,
    joinedDate: null,
    applicationSignals,
    interviewSignals,
    outcomeRating: outcome,
    rawText: text,
    sourceFile: fileName,
  });
}

export type HireLoadResult = {
  hires: HistoricalHireRecord[];
  skipped: { file: string; reason: string }[];
};

export async function loadHistoricalHires(dir: string): Promise<HireLoadResult> {
  const hires: HistoricalHireRecord[] = [];
  const skipped: { file: string; reason: string }[] = [];

  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return { hires, skipped };
  }

  for (const file of files) {
    if (file.toLowerCase() === "readme.md") continue;
    const fullPath = path.join(dir, file);
    const ext = path.extname(file).toLowerCase();

    try {
      if (ext === ".json") {
        const raw = await readFile(fullPath, "utf-8");
        const parsed = HistoricalHireRecordSchema.parse(JSON.parse(raw));
        hires.push(parsed);
        continue;
      }

      const doc = await parseDocumentToText(fullPath);
      if (doc.status === "FAILED") {
        skipped.push({ file, reason: doc.reason });
        continue;
      }
      const hire = parseFreeTextHire(file, doc.text);
      if (!hire) {
        skipped.push({ file, reason: "Could not find both a Role: and Outcome: line — see data/hires/README.md" });
        continue;
      }
      hires.push(hire);
    } catch (err) {
      skipped.push({ file, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { hires, skipped };
}
