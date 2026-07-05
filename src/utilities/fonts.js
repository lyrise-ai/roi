import { Inter } from 'next/font/google'

// Self-hosted replacement for the blocking Google Fonts <link> that used to
// live in _document.js. Imported by every file that hardcodes an 'Inter'
// fontFamily so the family name stays literally 'Inter'-shaped in call sites
// while the actual font is preloaded and self-hosted by Next.
export const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const INTER_FONT_FAMILY = `${inter.style.fontFamily}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
