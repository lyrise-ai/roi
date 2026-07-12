import localFont from 'next/font/local'

export const inter = localFont({
  src: [
    { path: '../../fonts/Outfit-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../fonts/Outfit-Medium.ttf', weight: '500', style: 'normal' },
    {
      path: '../../fonts/Outfit-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    { path: '../../fonts/Outfit-Bold.ttf', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
})

export const INTER_FONT_FAMILY = `${inter.style.fontFamily}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
