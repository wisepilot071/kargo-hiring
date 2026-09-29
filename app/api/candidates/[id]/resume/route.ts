import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db/client";
import { readResumeFile } from "@/lib/storage/files";

const CONTENT_TYPES: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  const buffer = await readResumeFile(candidate);
  if (!buffer) {
    return NextResponse.json(
      {
        error:
          "The original file isn't available in this environment (likely a seeded demo candidate whose file was never uploaded here). The extracted text is still shown on the candidate page.",
      },
      { status: 404 }
    );
  }

  const ext = path.extname(candidate.resumeFile).toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${candidate.resumeFile}"`,
    },
  });
}
