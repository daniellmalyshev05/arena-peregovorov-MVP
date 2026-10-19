import type { Metadata } from 'next'
import '@fontsource/dela-gothic-one/cyrillic-400.css'
import '@fontsource/dela-gothic-one/latin-400.css'
import './arcade.css'

export const metadata: Metadata = {
  title: 'Аркада — Арена переговоров',
}

export default function ArcadeLayout({ children }: { children: React.ReactNode }) {
  return <div className="arc">{children}</div>
}
