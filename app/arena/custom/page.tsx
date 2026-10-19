import { CustomEntry } from '@/components/CustomEntry'

export default function CustomArenaPage() {
  // Без ключа и в запасном режиме распознавать нечем — кнопки голоса нет.
  const voice = process.env.DEMO_MODE !== 'true' && !!process.env.OPENROUTER_API_KEY
  return <CustomEntry voice={voice} />
}
