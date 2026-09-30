import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Arial", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        chrome: "hsl(var(--chrome))",
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
        clay: {
          DEFAULT: "hsl(var(--brand-clay))",
          hover: "hsl(var(--brand-clay-hover))",
        },
        beige: {
          DEFAULT: "hsl(var(--secondary))",
          deep: "hsl(var(--beige-deep))",
        },
        favorable: "hsl(var(--favorable))",
        desfavorable: "hsl(var(--desfavorable))",
        chart: {
          clay: "hsl(var(--brand-clay))",
          clayHover: "hsl(var(--brand-clay-hover))",
          ochre: "hsl(var(--metric-efficiency-fg))",
          sage: "hsl(var(--favorable))",
          taupe: "hsl(var(--muted-foreground))",
        },
        category: {
          margins: "hsl(var(--metric-margins-bg))",
          marginsFg: "hsl(var(--metric-margins-fg))",
          return: "hsl(var(--metric-return-bg))",
          returnFg: "hsl(var(--metric-return-fg))",
          efficiency: "hsl(var(--metric-efficiency-bg))",
          efficiencyFg: "hsl(var(--metric-efficiency-fg))",
          solvency: "hsl(var(--metric-solvency-bg))",
          solvencyFg: "hsl(var(--metric-solvency-fg))",
          management: "hsl(var(--metric-management-bg))",
          managementFg: "hsl(var(--metric-management-fg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        panel: "28px",
        card: "12px",
        control: "8px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
