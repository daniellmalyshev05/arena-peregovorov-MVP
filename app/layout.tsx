import type { Metadata } from 'next'
import '@fontsource-variable/golos-text'
import '@fontsource-variable/jetbrains-mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Арена — симулятор деловых переговоров',
  description:
    'Симулятор деловых переговоров: каждая формулировка меняет экономику сделки, а любой ход можно вернуть и переиграть.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
