import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db/client";

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

  const filePath = path.join(process.cwd(), "data", "applications", candidate.resumeFile);
  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(candidate.resumeFile).toLowerCase();
    return new NextResponse(buffer, {
      headers: {
        "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "content-disposition": `attachment; filename="${candidate.resumeFile}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Original resume file is no longer available on disk." }, { status: 404 });
  }
}
