import { existsSync, readFileSync, statSync } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { EMBEDDED_DEMO_DB_BASE64 } from "@/lib/db/embedded-demo-db";

export async function GET() {
  const dest = path.join(os.tmpdir(), "demo.db");
  const info: Record<string, unknown> = {
    DATABASE_MODE: process.env.DATABASE_MODE ?? null,
    tmpdir: os.tmpdir(),
    dest,
    embeddedBase64Length: EMBEDDED_DEMO_DB_BASE64?.length ?? null,
    destExistsBeforeRead: existsSync(dest),
  };
  if (existsSync(dest)) {
    info.destSize = statSync(dest).size;
    info.destHeader = readFileSync(dest).subarray(0, 16).toString("utf8");
  }
  return NextResponse.json(info);
}
