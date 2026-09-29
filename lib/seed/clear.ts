import "dotenv/config";
import { prisma } from "@/lib/db/client";

async function main() {
  console.log("Clearing all seeded/generated data...");
  await prisma.auditEvent.deleteMany();
  await prisma.emailDraft.deleteMany();
  await prisma.founderDecision.deleteMany();
  await prisma.interviewBrief.deleteMany();
  await prisma.candidateEvaluation.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.hiringCriterion.deleteMany();
  await prisma.historicalHire.deleteMany();
  await prisma.jobDescription.deleteMany();
  console.log("Done. Run `npm run seed` to repopulate.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
