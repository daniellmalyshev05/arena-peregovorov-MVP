import { notFound } from 'next/navigation'
import { arcadeOpponents, getArcadeOpponent } from '@/lib/arcade/opponents'
import { ArcadeFight } from '@/components/arcade/ArcadeFight'

export function generateStaticParams() {
  return arcadeOpponents.map((o) => ({ id: o.scenario.id }))
}

export default async function ArcadeFightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!getArcadeOpponent(id)) notFound()
  // Без ключа и в запасном режиме распознавать нечем — кнопки голоса нет.
  const voice = process.env.DEMO_MODE !== 'true' && !!process.env.OPENROUTER_API_KEY
  return <ArcadeFight key={id} opponentId={id} voice={voice} />
}
