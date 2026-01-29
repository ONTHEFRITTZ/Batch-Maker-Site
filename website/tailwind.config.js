/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bakery: {
          bg: "#FAF9F7",
          card: "#FFFFFF",
          ink: "#1F2937",
          muted: "#6B7280",
          accent: "#7C9A8E",
          accentSoft: "#E6EFEA",
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.06)",
      },
    },
  },
 plugins: [
  require("@tailwindcss/typography"),
],

}
