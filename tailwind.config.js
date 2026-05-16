/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "#09090b",   
        panel: "#121214",     
        primary: "rgb(var(--primary) / <alpha-value>)",
        border: "var(--border)",    
        muted: "#a1a1aa",     
      }
    },
  },
  plugins: [],
}