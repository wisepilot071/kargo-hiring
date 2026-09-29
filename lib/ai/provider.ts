import type { AiProvider } from "@/lib/ai/types";
import { MockAiProvider } from "@/lib/ai/mock";
import { AnthropicAiProvider } from "@/lib/ai/anthropic";

let cached: AiProvider | null = null;

/**
 * Single entry point the rest of the app calls through. Swapping providers
 * is one env var (AI_PROVIDER=mock|anthropic) — nothing else in the app
 * imports MockAiProvider / AnthropicAiProvider directly.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const kind = process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "mock";
  if (kind === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.warn("[ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing — falling back to mock provider.");
    cached = new MockAiProvider();
  } else {
    cached = kind === "anthropic" ? new AnthropicAiProvider() : new MockAiProvider();
  }
  return cached;
}
