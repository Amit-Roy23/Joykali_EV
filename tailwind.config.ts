import type { Config } from "tailwindcss";

/**
 * Joykali "Charge" design system.
 * - brand: electric indigo — primary actions, links, focus
 * - volt:  lime accent — highlights on dark surfaces, charge bars, active nav
 * - ink:   near-black indigo — sidebar, hero surfaces
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
          50: "#eef0ff",
          100: "#e0e4ff",
          200: "#c7ccfe",
          300: "#a5abfc",
          400: "#8285f8",
          500: "#6563f1",
          600: "#5146e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
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
          700: "#23214a",
          800: "#17153a",
          900: "#0f0e29",
          950: "#09081c",
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
          to: { opacity: "1", transform: "translateY(0)" },
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
        "fade-up": "fade-up .35s ease-out both",
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
