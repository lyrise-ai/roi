/** @type {import('tailwindcss').Config} */

/* Design system tokens live in styles/tokens/*.css as CSS custom properties.
   This file only maps them to Tailwind utility names — it never restates a
   value. Change a token in CSS, every utility follows.

   Deliberately NOT mapped: the numeric radius/shadow/font-size ramps. The
   token scales are one step off Tailwind's defaults (--radius-sm is 8px vs
   rounded-sm's 2px; --text-xl is 24px vs text-xl's 20px), so overriding them
   would silently resize ~280 existing `rounded-*` and ~280 `text-*` usages.
   Semantic names (rounded-card, shadow-glass) are exposed instead; reach for
   text-[length:var(--text-xl)] on the rare occasion you need the raw step. */

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // --- Pre-design-system colors, still referenced in the app ---
        primary: 'rgba(41, 87, 255, 1)',
        navy: '#1a2742',
        'new-black': '#2C2C2C',
        terminal: {
          bg: '#151d2e',
          fg: '#e4e7f0',
          muted: '#7e8ea8',
          border: '#2c3a51',
        },

        // --- Brand (Brand Manual p.8/p.10) ---
        brand: {
          purple: 'var(--lyrise-purple)',
          violet: 'var(--lyrise-violet)',
          dark: 'var(--dark-blue)',
          grey: 'var(--brand-grey)',
          remarkable: 'var(--remarkable)',
          power: 'var(--power)',
          trust: 'var(--trust)',
          sunny: 'var(--sunny)',
          pinky: 'var(--pinky)',
          grow: 'var(--grow)',
        },

        // Ramps. Both names were unused by Tailwind's defaults in this repo,
        // so they shadow the stock palettes without touching existing markup.
        purple: {
          50: 'var(--purple-50)',
          100: 'var(--purple-100)',
          200: 'var(--purple-200)',
          300: 'var(--purple-300)',
          400: 'var(--purple-400)',
          500: 'var(--purple-500)',
          600: 'var(--purple-600)',
          700: 'var(--purple-700)',
          800: 'var(--purple-800)',
          900: 'var(--purple-900)',
        },
        neutral: {
          0: 'var(--neutral-0)',
          50: 'var(--neutral-50)',
          100: 'var(--neutral-100)',
          200: 'var(--neutral-200)',
          300: 'var(--neutral-300)',
          400: 'var(--neutral-400)',
          500: 'var(--neutral-500)',
          600: 'var(--neutral-600)',
          700: 'var(--neutral-700)',
          800: 'var(--neutral-800)',
          900: 'var(--neutral-900)',
        },

        // --- Semantic aliases. Prefer these in new work. ---
        ink: {
          DEFAULT: 'var(--text-body)',
          heading: 'var(--text-heading)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
          accent: 'var(--text-accent)',
        },
        surface: {
          DEFAULT: 'var(--surface-page)',
          subtle: 'var(--surface-subtle)',
          card: 'var(--surface-card)',
          inverse: 'var(--surface-inverse)',
          accent: 'var(--surface-accent)',
          'accent-subtle': 'var(--surface-accent-subtle)',
        },
        line: {
          DEFAULT: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          accent: 'var(--border-accent)',
          glass: 'var(--border-glass)',
        },
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        info: 'var(--info)',
        highlight: 'var(--highlight)',
      },

      // One family, everywhere (Brand Manual p.22). base.css already sets it on
      // body, so `font-sans` is only needed to climb back out of a `font-mono`.
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },

      borderRadius: {
        card: 'var(--radius-card)',
        glass: 'var(--radius-glass)',
        control: 'var(--radius-control)',
        field: 'var(--radius-field)',
        pill: 'var(--radius-pill)',
      },

      boxShadow: {
        glass: 'var(--shadow-glass)',
        accent: 'var(--shadow-accent)',
        hairline: 'var(--shadow-inset-hairline)',
        'glow-purple': 'var(--glow-purple)',
      },

      backdropBlur: {
        glass: '15px',
      },

      backgroundImage: {
        glass: 'var(--glass-fill)',
        'glass-dark': 'var(--glass-fill-dark)',
        reflections: 'var(--bg-reflections)',
        deep: 'var(--bg-deep)',
      },

      transitionTimingFunction: {
        brand: 'var(--ease-out)',
        'brand-in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
        reveal: 'var(--duration-reveal)',
      },

      maxWidth: {
        container: 'var(--container-max)',
        narrow: 'var(--container-narrow)',
      },
    },
  },
  plugins: [],
}
