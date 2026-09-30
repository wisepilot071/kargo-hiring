import type { AiProvider } from "@/lib/ai/types";
import { MockAiProvider } from "@/lib/ai/mock";
import { AnthropicAiProvider } from "@/lib/ai/anthropic";
import { GeminiAiProvider } from "@/lib/ai/gemini";

let cached: AiProvider | null = null;

const REQUIRED_KEY: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/**
 * Single entry point the rest of the app calls through. Swapping providers
 * is one env var (AI_PROVIDER=mock|anthropic|gemini) — nothing else in the
 * app imports a concrete provider class directly.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  const kind = process.env.AI_PROVIDER === "anthropic" || process.env.AI_PROVIDER === "gemini" ? process.env.AI_PROVIDER : "mock";

  const requiredKey = REQUIRED_KEY[kind];
  if (requiredKey && !process.env[requiredKey]) {
    console.warn(`[ai] AI_PROVIDER=${kind} but ${requiredKey} is missing — falling back to mock provider.`);
    cached = new MockAiProvider();
    return cached;
  }

  cached = kind === "anthropic" ? new AnthropicAiProvider() : kind === "gemini" ? new GeminiAiProvider() : new MockAiProvider();
  return cached;
}
