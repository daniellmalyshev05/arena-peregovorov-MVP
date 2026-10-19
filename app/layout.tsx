import type { Metadata } from 'next'
import '@fontsource-variable/golos-text'
import '@fontsource-variable/jetbrains-mono'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://arena-peregovorov-mvp.vercel.app'),
  title: 'Арена — симулятор деловых переговоров',
  description:
    'Симулятор деловых переговоров: каждая формулировка меняет экономику сделки, а любой ход можно вернуть и переиграть.',
  // Превью ссылки в мессенджерах; картинка — app/opengraph-image.png.
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Арена',
    title: 'Арена переговоров',
    description:
      'Симулятор деловых переговоров: выясняйте скрытые интересы второй стороны и собирайте сделку. Исход считает алгоритм, а не ИИ.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
