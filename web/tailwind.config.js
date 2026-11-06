/** @type {import('tailwindcss').Config} */
// Design system modelled on Chakra UI Pro (v3): zinc greys, a single accent
// ("brand", defined as CSS variables in index.css so it can be swapped for
// teal/blue/etc.), Outfit type and small radii.
const brand = (shade) => `rgb(var(--brand-${shade}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gray: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#111111",
        },
        brand: {
          50: brand(50),
          100: brand(100),
          200: brand(200),
          300: brand(300),
          400: brand(400),
          500: brand(500),
          600: brand(600),
          700: brand(700),
          800: brand(800),
          900: brand(900),
          950: brand(950),
        },
        canvas: "#fcfcfc",
        fg: { DEFAULT: "#111111", muted: "#52525b", subtle: "#a1a1aa" },
      },
      fontFamily: {
        sans: ["Outfit Variable", "Outfit", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Outfit Variable", "Outfit", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Chakra "radius: sm" scale — controls use rounded-lg, cards rounded-xl.
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.25rem",
        lg: "0.25rem",
        xl: "0.375rem",
        "2xl": "0.5rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(24,24,27,0.05)",
        pop: "0 10px 30px -6px rgba(24,24,27,0.18), 0 2px 6px -2px rgba(24,24,27,0.08)",
      },
      letterSpacing: { tightest: "-0.035em" },
    },
  },
  plugins: [],
};
