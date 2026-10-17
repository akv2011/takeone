/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#f3f0e9",
        paper2: "#ebe7de",
        surface: "#fbfaf6",
        ink: "#141311",
        ink2: "#3a3833",
        muted: "#6b675e",
        faint: "#a8a397",
        line: "rgba(20, 19, 17, 0.12)",
        grease: "#c4321f",
        signal: "#c4321f",
        // `cue` is the accent used across the app; it maps to the grease-pencil red.
        cue: "#c4321f",
        cueInk: "#9c2717",
        go: "#1f7a4d",
        goBg: "#e6f2eb",
        wait: "#9a6200",
        waitBg: "#f8eedb",
        warn: "#c4321f",
        warnBg: "#fbe7e3",
        film: "#1b1814",
        edge: "#e3a33a",
        bar: {
          white: "#fbfaf6",
          yellow: "#141311",
          cyan: "#fbfaf6",
          green: "#141311",
          magenta: "#fbfaf6",
          red: "#c4321f",
          blue: "#141311",
        },
      },
      fontFamily: {
        sans: ["Mona Sans", "system-ui", "sans-serif"],
        display: ["Host Grotesk", "Mona Sans", "system-ui", "sans-serif"],
        serif: ["Host Grotesk", "Mona Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
        hand: ["Kalam", "cursive"],
      },
      borderRadius: {
        control: "11px",
        card: "16px",
      },
      boxShadow: {
        // Soft paper elevation. The `hard*` names are kept so existing classes keep working.
        card: "0 0 0 1px rgba(20,19,17,.10), 0 1px 2px rgba(20,19,17,.04), 0 8px 24px -12px rgba(20,19,17,.18)",
        lift: "0 0 0 1px rgba(20,19,17,.10), 0 2px 4px rgba(20,19,17,.05), 0 18px 40px -18px rgba(20,19,17,.28)",
        film: "0 40px 70px -30px rgba(40,30,20,.55), 0 2px 4px rgba(0,0,0,.12)",
        "hard-sm": "0 0 0 1px rgba(20,19,17,.10), 0 1px 2px rgba(20,19,17,.04), 0 8px 24px -12px rgba(20,19,17,.18)",
        hard: "0 0 0 1px rgba(20,19,17,.10), 0 2px 4px rgba(20,19,17,.05), 0 18px 40px -18px rgba(20,19,17,.28)",
        "hard-lg": "0 40px 70px -30px rgba(40,30,20,.45), 0 2px 4px rgba(0,0,0,.08)",
      },
      transitionTimingFunction: {
        paper: "cubic-bezier(.2, .8, .2, 1)",
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
