/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#f3f1ec",
        paper2: "#ebe8e1",
        surface: "#fbfaf7",
        ink: "#0e0e0d",
        ink2: "#3a3a37",
        muted: "#76746e",
        faint: "#a9a69e",
        line: "rgba(14, 14, 13, 0.14)",
        signal: "#d8341f",
        // `cue` is the accent used across the app; it now maps to the signal red.
        cue: "#d8341f",
        cueInk: "#a3240f",
        go: "#1f7a4d",
        goBg: "#e6f2eb",
        wait: "#9a6200",
        waitBg: "#f8eedb",
        warn: "#d8341f",
        warnBg: "#fbe7e3",
        bar: {
          white: "#fbfaf7",
          yellow: "#0e0e0d",
          cyan: "#fbfaf7",
          green: "#0e0e0d",
          magenta: "#fbfaf7",
          red: "#d8341f",
          blue: "#0e0e0d",
        },
      },
      fontFamily: {
        sans: ["Inter Tight", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["Instrument Serif", "Georgia", "serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
        hand: ["Caveat", "Comic Sans MS", "cursive"],
      },
      boxShadow: {
        hard: "8px 8px 0 0 rgba(14, 14, 13, 0.9)",
        "hard-sm": "4px 4px 0 0 rgba(14, 14, 13, 0.9)",
        "hard-lg": "14px 14px 0 0 rgba(14, 14, 13, 0.9)",
      },
      transitionTimingFunction: {
        paper: "cubic-bezier(.22, 1, .36, 1)",
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        marquee: 'marquee 38s linear infinite',
      },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
    },
  },
  plugins: [],
}
