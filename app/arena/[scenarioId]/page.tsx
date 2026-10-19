import { notFound } from 'next/navigation'
import { getScenario } from '@/lib/scenarios'
import { ArenaEntry } from '@/components/ArenaEntry'

export default async function ArenaPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params
  const scenario = getScenario(scenarioId)
  if (!scenario) notFound()
  // Без ключа и в запасном режиме распознавать нечем — кнопки голоса нет.
  const voice = process.env.DEMO_MODE !== 'true' && !!process.env.OPENROUTER_API_KEY
  return <ArenaEntry base={scenario} voice={voice} />
}
