/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1A1D29",
          soft: "#4B5066",
          faint: "#8A8FA3",
        },
        canvas: "#FAFAF8",
        surface: "#FFFFFF",
        line: "#E7E5E0",
        brand: {
          50: "#F1EFFD",
          100: "#E3DFFC",
          200: "#C7BEF8",
          300: "#A99DF3",
          400: "#8B7BEE",
          500: "#5B4FE5",
          600: "#4D3FDC",
          700: "#4338CA",
          800: "#372EA3",
          900: "#2B2480",
        },
        gold: {
          50: "#FBF6EA",
          100: "#F5E9CB",
          300: "#E2C386",
          500: "#C9A14A",
          700: "#A07D33",
        },
        success: {
          50: "#E8F7F0",
          500: "#1A9E72",
          700: "#13785A",
        },
        warning: {
          50: "#FCF1E2",
          500: "#C8780A",
          700: "#9C5E08",
        },
        danger: {
          50: "#FBEAEA",
          500: "#D14343",
          700: "#A93333",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(26,29,41,0.04), 0 8px 24px -8px rgba(26,29,41,0.08)",
        card: "0 1px 2px rgba(26,29,41,0.04), 0 12px 32px -12px rgba(26,29,41,0.10)",
        lifted: "0 4px 12px rgba(26,29,41,0.06), 0 24px 48px -16px rgba(26,29,41,0.16)",
        glow: "0 0 0 1px rgba(91,79,229,0.08), 0 8px 28px -6px rgba(91,79,229,0.28)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-468px 0" },
          "100%": { backgroundPosition: "468px 0" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(26,158,114,0.35)" },
          "100%": { boxShadow: "0 0 0 8px rgba(26,158,114,0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-in": "fade-in 0.4s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
