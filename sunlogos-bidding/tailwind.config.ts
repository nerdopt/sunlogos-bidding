import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#100c08",
        "ink-2": "#1a140e",
        cream: "#f3e6c8",
        gold: "#e4b049",
        ember: "#c45c26",
        oxblood: "#6b1d1d",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 80px rgba(228, 176, 73, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
