/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        vanguard: {
          bg: "#0a0a0a",
          card: "#141414",
          border: "#222",
          accent: "#00d4ff",
          purple: "#7b2ff7",
          green: "#00ff88",
          red: "#ff4444",
          yellow: "#ffaa00",
        },
      },
    },
  },
  plugins: [],
};
