/** @type {import('tailwindcss').Config} */

/* The design system's values live in styles/tokens/*.css as CSS variables. This
   file only gives them Tailwind names — it never repeats a value. Change one in
   the CSS and every utility follows.

   What is deliberately NOT mapped: the numbered scales for corner radius,
   shadow and font size. Our scale is one step off Tailwind's own (our small
   radius is 8px where Tailwind's is 2px; our extra-large text is 24px where
   Tailwind's is 20px), so overriding them would quietly resize about 280
   existing rounded-* and 280 text-* usages across the app.
   Named ones like rounded-card and shadow-glass are exposed instead. On the
   rare occasion you need a raw step, write it out longhand. */

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
        // --- Colours from before the design system, still used in places ---
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

        // Colour scales. Neither name was in use from Tailwind's own palette in
        // this repo, so these replace the stock ones without changing any
        // existing markup.
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

        // --- Names that say what they are for. Use these in new work. ---
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
