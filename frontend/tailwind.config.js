/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--c-brand) / <alpha-value>)",
          soft: "rgb(var(--c-brand-soft) / <alpha-value>)",
          dark: "rgb(var(--c-brand-dark) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--c-gold) / <alpha-value>)",
          tint: "rgb(var(--c-gold-tint) / <alpha-value>)",
          dark: "rgb(var(--c-gold-dark) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          2: "rgb(var(--c-ink-2) / <alpha-value>)",
          mute: "rgb(var(--c-ink-mute) / <alpha-value>)",
        },
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--c-surface) / <alpha-value>)",
          2: "rgb(var(--c-surface-2) / <alpha-value>)",
          hover: "rgb(var(--c-surface-hover) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--c-line) / <alpha-value>)",
          soft: "rgb(var(--c-line-soft) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--c-info) / <alpha-value>)",
          tint: "rgb(var(--c-info-tint) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--c-danger) / <alpha-value>)",
          tint: "rgb(var(--c-danger-tint) / <alpha-value>)",
        },
        magenta: {
          DEFAULT: "rgb(var(--c-magenta) / <alpha-value>)",
          dark: "rgb(var(--c-magenta-dark) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['"Montserrat"', "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "display-xl": ["38px", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "display-lg": ["28px", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        "display-md": ["20px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        label: ["10px", { lineHeight: "1.4", letterSpacing: "0.12em" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.05)",
        "card-hover": "0 4px 12px rgba(0, 0, 0, 0.08)",
        "btn-brand": "0 8px 24px -8px rgba(106, 50, 122, 0.45)",
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "soft-pulse": "pulse 2s infinite",
        "fade-in": "fade-in 0.3s ease",
      },
    },
  },
  plugins: [],
};
