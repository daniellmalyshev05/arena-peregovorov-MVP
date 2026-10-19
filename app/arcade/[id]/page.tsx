import { notFound } from 'next/navigation'
import { arcadeOpponents, getArcadeOpponent } from '@/lib/arcade/opponents'
import { ArcadeFight } from '@/components/arcade/ArcadeFight'

export function generateStaticParams() {
  return arcadeOpponents.map((o) => ({ id: o.scenario.id }))
}

export default async function ArcadeFightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!getArcadeOpponent(id)) notFound()
  return <ArcadeFight key={id} opponentId={id} />
}
