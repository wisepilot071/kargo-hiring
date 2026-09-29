import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light theme: token direction kept consistent with existing usage
        // across the app (ink-950 = furthest-from-text/background end,
        // ink-100 = closest-to-text/foreground end) — only the actual hex
        // values changed, so every existing `bg-ink-950` / `text-ink-100`
        // call site now resolves to the right end of a LIGHT scale without
        // needing to touch each file.
        ink: {
          950: "#fbf8f5", // page background
          900: "#ffffff", // card surface
          850: "#f2f2f8", // hover surface
          800: "#eaeaf2",
          700: "#dcdce6",
          650: "#cfcfdc",
          600: "#b7b7c9",
          500: "#8f8fa3",
          400: "#6b6b80",
          300: "#4e4e63",
          200: "#33333f",
          100: "#18181f", // primary text
        },
        // Brand accent: orange, used for primary actions/links/focus.
        brand: {
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
        // Semantic signal colors — light-tinted background + a dark-enough
        // foreground shade to read as text. "moderate" is deliberately a
        // muted gold/olive rather than orange now that brand itself is
        // orange — status must never be conveyed by brand color alone.
        signal: {
          strong: "#0f7a4f",
          strongBg: "#e3f6ec",
          moderate: "#8a6314",
          moderateBg: "#fbf0d9",
          weak: "#c0293f",
          weakBg: "#fce6e9",
        },
        gold: {
          400: "#a16207",
          500: "#854d0e",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Inter", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(234,88,12,0.18), 0 8px 20px -10px rgba(234,88,12,0.35)",
        card: "0 1px 2px rgba(24,24,31,0.04), 0 8px 24px -12px rgba(24,24,31,0.12)",
      },
      backgroundImage: {
        "grid-fade": "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(234,88,12,0.08), transparent)",
      },
    },
  },
  plugins: [],
};
export default config;
