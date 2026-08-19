import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        background: "var(--bg)",
        foreground: "var(--foreground)",
        surface:    "var(--surface)",
        border:     "var(--border)",
        muted:      "var(--muted)",
        subtle:     "var(--subtle)",
        cyan:       "var(--cyan)",
        amber:      "var(--amber)",
        emerald:    "var(--emerald)",
      },
      keyframes: {
        "radar-sweep": {
          from: { transform: "rotate(0deg)" },
          to:   { transform: "rotate(360deg)" },
        },
        "radar-ping": {
          "0%":   { transform: "scale(0.4)", opacity: "0.7" },
          "100%": { transform: "scale(1)",   opacity: "0" },
        },
        "wave-pulse": {
          "0%, 100%": { transform: "scaleY(0.25)", opacity: "0.35" },
          "50%":      { transform: "scaleY(1)",    opacity: "1" },
        },
        "sort-bar": {
          "0%, 100%": { transform: "scaleY(0.2)" },
          "50%":      { transform: "scaleY(1)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "radar-sweep": "radar-sweep 4s linear infinite",
        "radar-ping":  "radar-ping 2s ease-out infinite",
        "wave-pulse":  "wave-pulse 1.4s ease-in-out infinite",
        "sort-bar":    "sort-bar 1.2s ease-in-out infinite",
        shimmer:       "shimmer 1.6s linear infinite",
        "fade-in":     "fade-in 0.35s ease both",
      },
    },
  },
  plugins: [],
};
export default config;
