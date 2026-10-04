/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b0f14",
        surface: "#151b23",
        border: "#2a3441",
        text: "#e8eef5",
        muted: "#8b98a8",
        accent: "#3b82f6",
        positive: "#22c55e",
        negative: "#ef4444",
      },
    },
  },
  plugins: [],
};
