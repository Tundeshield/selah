/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#20342C", 50: "#EEF2EF", 100: "#DCE5D9", 600: "#2B4539", 700: "#20342C", 800: "#18271F", 900: "#101A15" },
        cream: { DEFAULT: "#F7F4ED", 50: "#FCFBF7", 100: "#F7F4ED", 200: "#EFEADF", 300: "#E4DDCD" },
        sage: { DEFAULT: "#DCE5D9", 50: "#F1F5EF", 100: "#E7EEE5", 200: "#DCE5D9", 300: "#C3D2BE", 500: "#7E9878", 700: "#4F6A4A" },
        gold: { DEFAULT: "#C5A56A", 50: "#FAF5EA", 100: "#F2E7CF", 500: "#C5A56A", 700: "#8F7240" },
        charcoal: { DEFAULT: "#343A36", 400: "#6B716C", 500: "#555B57" },
      },
      fontFamily: {
        serif: ['"DM Serif Display"', "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(32,52,44,0.04), 0 1px 1px rgba(32,52,44,0.03)",
        pop: "0 12px 32px -8px rgba(32,52,44,0.25)",
      },
    },
  },
  plugins: [],
};
