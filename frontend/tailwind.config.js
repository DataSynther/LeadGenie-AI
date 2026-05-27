/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand & text
        brand: {
          DEFAULT: "#6A327A",
          soft: "#E8DFFF",
          dark: "#4A2256",
        },
        gold: {
          DEFAULT: "#FAB818",
          tint: "#FFF8E7",
          dark: "#B07A00",
        },
        // Text scale
        ink: {
          DEFAULT: "#333333",
          2: "#808080",
          mute: "#B0B0B0",
        },
        // Surfaces
        canvas: "#FAFAFB",
        surface: {
          DEFAULT: "#FFFFFF",
          2: "#F3EFF5",
          hover: "#E2DFE4",
        },
        line: {
          DEFAULT: "#D0CAD4",
          soft: "#EAE6EC",
        },
        // State accents
        info: {
          DEFAULT: "#2B4CFF",
          tint: "#E8DFFF",
        },
        danger: {
          DEFAULT: "#FF6F3D",
          tint: "#FFEFE9",
        },
        magenta: {
          DEFAULT: "#EA66EE",
          dark: "#A832A8",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        // Custom sizes used across the design
        "display-xl": ["38px", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "display-lg": ["28px", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        "display-md": ["20px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        label: ["10px", { lineHeight: "1.4", letterSpacing: "0.12em" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(51, 51, 51, 0.03)",
        "card-hover": "0 4px 12px rgba(51, 51, 51, 0.06)",
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
