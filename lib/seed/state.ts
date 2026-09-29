import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { HistoricalSignal } from "@/lib/ai/types";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");
const SIGNALS_FILE = path.join(GENERATED_DIR, "historical-signals.json");

export async function saveCachedSignals(signals: HistoricalSignal[]): Promise<void> {
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(SIGNALS_FILE, JSON.stringify(signals, null, 2), "utf-8");
}

export async function loadCachedSignals(): Promise<HistoricalSignal[]> {
  try {
    const raw = await readFile(SIGNALS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
