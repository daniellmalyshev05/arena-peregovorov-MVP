import { notFound } from 'next/navigation'
import { getScenario } from '@/lib/scenarios'
import { ArenaEntry } from '@/components/ArenaEntry'

export default async function ArenaPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params
  const scenario = getScenario(scenarioId)
  if (!scenario) notFound()
  return <ArenaEntry base={scenario} />
}
