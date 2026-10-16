/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#EEF0F3",
        surface: "#FFFFFF",
        ink: "#1A1F36",
        ink2: "#2A3150",
        muted: "#5B6175",
        faint: "#8A90A2",
        line: "#D6DAE1",
        cue: "#FFD23F",
        cueInk: "#7A5A00",
        go: "#1E7A45",
        warn: "#B4430B",
        bar: {
          white: "#BFBFBF",
          yellow: "#BFBF00",
          cyan: "#00BFBF",
          green: "#00BF00",
          magenta: "#BF00BF",
          red: "#BF0000",
          blue: "#0000BF",
        },
      },
      fontFamily: {
        sans: ["Atkinson Hyperlegible Next", "Atkinson Hyperlegible", "system-ui", "sans-serif"],
        display: ["Big Shoulders Display", "Impact", "system-ui", "sans-serif"],
        mono: ["Atkinson Hyperlegible Mono", "ui-monospace", "monospace"],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
