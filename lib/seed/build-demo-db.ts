import "dotenv/config";
import { readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db/client";
import { getAiProvider } from "@/lib/ai/provider";
import { parseDocumentToText } from "@/lib/parsers/document";
import { publishRubricVersion } from "@/lib/scoring/versioning";
import type { RoleT } from "@/lib/types";

/**
 * Builds a small, self-contained SQLite file containing ONLY job
 * descriptions and derived rubrics — deliberately never touches
 * data/applications, so this file (which gets committed and bundled into
 * the deployment, unlike the real dev.db) never carries any candidate PII.
 * Used for a no-external-database Vercel deploy: reads work everywhere
 * since the file ships with the deployment; new uploads/decisions made
 * against the live demo won't survive a cold start, which is the accepted
 * tradeoff of not having a real hosted database wired up yet.
 */
async function main() {
  const ai = getAiProvider();
  const jdsDir = path.join(process.cwd(), "data", "jds");
  const files = await readdir(jdsDir);
  const jds: { role: RoleT; rawText: string }[] = [];

  for (const file of files) {
    const role = /spm/i.test(file) ? "SPM" : /pm/i.test(file) ? "PM" : null;
    if (!role) continue;
    const doc = await parseDocumentToText(path.join(jdsDir, file));
    if (doc.status !== "OK") continue;
    const requirements = await ai.parseJobDescription(role as RoleT, doc.text);
    await prisma.jobDescription.upsert({
      where: { role },
      create: { role, sourceFile: file, rawText: doc.text, parsedRequirements: JSON.stringify(requirements) },
      update: { sourceFile: file, rawText: doc.text, parsedRequirements: JSON.stringify(requirements) },
    });
    jds.push({ role: role as RoleT, rawText: doc.text });
    console.log(`  ✓ ${role}: ${requirements.length} requirements from ${file}`);
  }

  for (const { role } of jds) {
    const jd = await prisma.jobDescription.findUnique({ where: { role } });
    if (!jd) continue;
    const requirements = JSON.parse(jd.parsedRequirements);
    const criteria = await ai.generateRubric(role, requirements, []);
    const result = await publishRubricVersion(role, criteria);
    console.log(`  ✓ ${role} rubric: ${criteria.length} criteria (v${result.version})`);
  }

  console.log("\nDemo DB built: job descriptions + rubrics only, zero candidates, zero PII.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
