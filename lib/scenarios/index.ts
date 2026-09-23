import type { Scenario } from '@/lib/types'
import { residentAttraction } from './resident-attraction'
import { contractorDelay } from './contractor-delay'
import { residentDefault } from './resident-default'
import { supplierHike } from './supplier-hike'
import { itBudget } from './it-budget'
import { retentionOffer } from './retention-offer'
import { clientDiscount } from './client-discount'

/**
 * Порядок здесь — порядок прохождения и ступеней в холле.
 * Прогрессия задана не сложностью чисел, а типом второй стороны и тем,
 * какая часть стола закрыта на старте:
 *   1. привлечение резидента — жёсткая сторона, 2 условия из 6 открыты;
 *   2. срыв сроков — тревожная сторона, 2 из 6;
 *   3. невыполнение обязательств — ложная срочность, 1 из 6, слабый запасной
 *      вариант у второй стороны: здесь впервые выгодно уметь выйти;
 *   4. рост тарифа — партнёрская сторона, 1 из 7, и единственный сценарий,
 *      где скрытое раскрывается объективным критерием, а не вопросом.
 *
 * 5–7 — кейсы вне промышленного контура: внутренний бюджет, удержание
 * сотрудника, продажа при продлении — под контекст администратора про ИТ,
 * HR или продажи.
 */
export const scenarios: Scenario[] = [
  residentAttraction,
  contractorDelay,
  residentDefault,
  supplierHike,
  itBudget,
  retentionOffer,
  clientDiscount,
]

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}
