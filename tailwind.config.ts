import type { Config } from "tailwindcss";

/**
 * Joykali "Charge" design system.
 * - brand: royal blue chosen by the client (#0D47A1 → #1976C0) — primary actions, links, focus
 * - volt:  lime accent — highlights on blue surfaces, charge bars, active nav
 * - ink:   deep navy blue — dark buttons; sidebar and hero use the client's blue gradient
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        brand: {
          50: "#e9f2fd",
          100: "#d3e5fb",
          200: "#a9caf5",
          300: "#77a9ec",
          400: "#4589dc",
          500: "#1e73cf",
          600: "#1565c0",
          700: "#0d55ad",
          800: "#0d47a1",
          900: "#0b3a85",
          950: "#072657",
        },
        volt: {
          50: "#f8fee7",
          100: "#effccb",
          200: "#e0f99d",
          300: "#cdf264",
          400: "#b9e937",
          500: "#9bcf18",
          600: "#78a60e",
          700: "#5a7e10",
          800: "#496413",
          900: "#3e5515",
        },
        ink: {
          700: "#1a4c95",
          800: "#0f3d82",
          900: "#0a3170",
          950: "#06204d",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        lift: "0 10px 30px -12px rgba(49,46,129,0.25)",
        glow: "0 0 0 1px rgba(185,233,55,0.35), 0 8px 30px -8px rgba(185,233,55,0.45)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          // "none", not translateY(0): with fill-mode "both" the end value stays applied, and any
          // transform would make the page a containing block for fixed popups and action bars.
          to: { opacity: "1", transform: "none" },
        },
        charge: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "28px 0" },
        },
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "sheet-up": {
          from: { transform: "translateY(16px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        pulse2: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: ".45" },
        },
      },
      animation: {
        // "backwards": hold the start state during any delay, but keep nothing once finished —
        // a lingering transform would make the page a containing block for fixed popups / action bars.
        "fade-up": "fade-up .35s ease-out backwards",
        charge: "charge 1.2s linear infinite",
        "slide-in": "slide-in .22s ease-out",
        "sheet-up": "sheet-up .22s ease-out",
        pulse2: "pulse2 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
