/**
 * Ссылка с настройкой администратора.
 *
 * Проверяем не «кодируется ли строка», а то, ради чего ссылка существует:
 * участник, открывший её, должен получить ровно ту симуляцию, которую собрал
 * администратор, а испорченная ссылка не должна ни падать, ни подсовывать
 * вырожденный кейс.
 */
import { scenarios } from '@/lib/scenarios'
import { applyConfig, defaultConfig, TONES, type AdminConfig } from '@/lib/admin/config'
import { decodeConfig, encodeConfig } from '@/lib/admin/link'
import { auditScenario } from '@/lib/engine/audit'

let failed = 0
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failed++
    console.log('  ✗', what)
  }
}

console.log('Ссылка с настройкой\n')

// 1. Полный круг: любая настройка доезжает до участника без потерь.
for (const base of scenarios) {
  const cfg: AdminConfig = {
    ...defaultConfig(base),
    sphere: 'Закупки и снабжение',
    topic: 'Пересмотр рамочного договора',
    difficulty: 5,
    tone: 'false_urgency',
    opponentName: 'Марина Крылова',
    opponentRole: 'коммерческий директор',
    opponentGoal: 'Поднять тариф на 15% с первого числа и не обсуждать объёмы',
    rounds: 9,
  }
  const decoded = decodeConfig(scenarios, encodeConfig(base, cfg, 'offline'))
  check(decoded !== null, `${base.id}: ссылка разобралась`)
  if (!decoded) continue

  check(JSON.stringify(decoded.cfg) === JSON.stringify(cfg), `${base.id}: настройка совпала до поля`)
  check(decoded.mode === 'offline', `${base.id}: режим оппонента доехал`)

  const here = applyConfig(base, cfg)
  const there = applyConfig(base, decoded.cfg)
  check(JSON.stringify(here) === JSON.stringify(there), `${base.id}: сценарий у участника тот же, что у администратора`)
  check(here.userBatna.value === there.userBatna.value, `${base.id}: пороги отказа совпали`)
}

// 2. Незаполненная настройка едет коротко: ссылка не разрастается впустую.
{
  const base = scenarios[0]
  const bare = encodeConfig(base, defaultConfig(base))
  const full = encodeConfig(base, { ...defaultConfig(base), opponentGoal: 'ж'.repeat(300) })
  check(bare.length < 60, `библиотечный кейс кодируется коротко (${bare.length} знаков)`)
  check(full.length > bare.length * 4, 'изменённая настройка занимает больше')
  const decoded = decodeConfig(scenarios, bare)
  check(
    JSON.stringify(decoded?.cfg) === JSON.stringify(defaultConfig(base)),
    'короткая ссылка разворачивается в библиотечный кейс',
  )
  check(decoded?.mode === 'auto', 'основной режим — по умолчанию, в ссылке его нет')
}

// 3. Только свой кейс: ссылку нельзя применить к чужому сценарию.
{
  const code = encodeConfig(scenarios[0], { ...defaultConfig(scenarios[0]), difficulty: 5 })
  check(decodeConfig([scenarios[1]], code) === null, 'ссылка от другого кейса отвергается')
  check(decodeConfig([scenarios[0]], code) !== null, 'ссылка своего кейса принимается')
}

// 4. Испорченная ссылка не роняет экран и не даёт вырожденный кейс.
{
  const base = scenarios[0]
  const good = encodeConfig(base, defaultConfig(base))
  const broken = [
    '',
    '!!!!',
    'абвгд',
    good.slice(0, 5),
    good + 'AAAA',
    Buffer.from(JSON.stringify({ b: base.id, d: 99, r: -4, o: 'кто-то' })).toString('base64url'),
    Buffer.from(JSON.stringify({ b: 'нет-такого' })).toString('base64url'),
    Buffer.from('не json').toString('base64url'),
  ]
  for (const code of broken) {
    let decoded: ReturnType<typeof decodeConfig> = null
    try {
      decoded = decodeConfig(scenarios, code)
    } catch (e) {
      check(false, `испорченная ссылка уронила разбор: ${String(e)}`)
      continue
    }
    if (!decoded) continue
    check(decoded.cfg.difficulty >= 1 && decoded.cfg.difficulty <= 5, 'сложность из ссылки в допустимых границах')
    check(decoded.cfg.rounds >= 4 && decoded.cfg.rounds <= 24, 'число раундов из ссылки в допустимых границах')
    check(TONES.some((t) => t.value === decoded!.cfg.tone), 'тон из ссылки существует')
    check(auditScenario(applyConfig(base, decoded.cfg)).playable, 'кейс из испорченной ссылки остаётся играбельным')
  }
}

// 5. Ссылка держит кириллицу: имена и цели пишутся по-русски.
{
  const base = scenarios[0]
  const goal = 'Снизить ставку аренды на 40% — иначе площадка не проходит по экономике'
  const decoded = decodeConfig(scenarios, encodeConfig(base, { ...defaultConfig(base), opponentGoal: goal }))
  check(decoded?.cfg.opponentGoal === goal, 'кириллица в ссылке не портится')
}

console.log(failed === 0 ? '\n✓ ссылка доносит настройку целиком и переживает порчу' : `\n${failed} провалов`)
process.exit(failed === 0 ? 0 : 1)
