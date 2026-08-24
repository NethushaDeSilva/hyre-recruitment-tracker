/**
 * Tailwind theme for Hyre.
 * Two layers:
 *  1. shadcn/ui semantic tokens (background, primary, muted, …) driven by the
 *     CSS variables in src/index.css — so shadcn components render correctly.
 *  2. Hyre brand tokens: `ink`, `gold` (the amber accent), and the `stage.*`
 *     pipeline colours from the Hyre design system.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      screens: {
        xs: "400px", // narrow phones / flip phones
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // --- Hiree brand tokens ---
        ink: "#000000", // primary text — pure black (Altrium)
        gold: "#F5C518", // Altrium golden-yellow accent

        // Pipeline stage colours (pills + board)
        stage: {
          applied: "#64748B",
          screening: "#2563EB",
          interview: "#4F46E5",
          final: "#E0A422",
          hired: "#16A34A",
          rejected: "#DC2626",
          hold: "#94A3B8",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Soft, subtle elevations — never harsh.
        card: "0 1px 2px rgba(22, 35, 58, 0.04), 0 8px 24px rgba(22, 35, 58, 0.06)",
        pop: "0 4px 12px rgba(22, 35, 58, 0.08), 0 16px 40px rgba(22, 35, 58, 0.12)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
