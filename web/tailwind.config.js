/** @type {import('tailwindcss').Config} */
// Selah Studio design system.
// Ink + warm paper neutrals, one luminous accent ("Selah teal"), Archivo
// (expanded) for display type and Inter for the interface. All sizes are in
// rem so the per-person text-size setting scales the whole UI.
const brand = (shade) => `rgb(var(--brand-${shade}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm neutral greys
        gray: {
          50: "#fafaf9",
          100: "#f4f4f1",
          200: "#e8e7e3",
          300: "#d6d4cf",
          400: "#a8a59f",
          500: "#78756f",
          600: "#57544f",
          700: "#43403b",
          800: "#292723",
          900: "#1b1a17",
          950: "#0b0d0e",
        },
        ink: { DEFAULT: "#0b0d0e", 900: "#121517", 800: "#1b1f22", 700: "#272c30", 600: "#363c41" },
        brand: {
          50: brand(50), 100: brand(100), 200: brand(200), 300: brand(300), 400: brand(400), 500: brand(500),
          600: brand(600), 700: brand(700), 800: brand(800), 900: brand(900), 950: brand(950),
        },
        canvas: "#f4f4f1",
        fg: { DEFAULT: "#0b0d0e", muted: "#57544f", subtle: "#a8a59f" },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Archivo Variable"', "Archivo", '"Inter Variable"', "ui-sans-serif", "sans-serif"],
      },
      borderRadius: {
        sm: "0.375rem",
        DEFAULT: "0.5rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,13,14,0.04), 0 1px 1px rgba(11,13,14,0.03)",
        pop: "0 24px 48px -16px rgba(11,13,14,0.25), 0 4px 12px -4px rgba(11,13,14,0.08)",
        glow: "0 0 0 1px rgb(var(--brand-300) / 0.25), 0 8px 32px -8px rgb(var(--brand-400) / 0.55)",
      },
      letterSpacing: { tightest: "-0.035em" },
    },
  },
  plugins: [],
};
