import '@fontsource/dela-gothic-one/cyrillic-400.css'
import { arcadeOpponents, type ArcadeLevel } from '@/lib/arcade/opponents'

/** Сложность соперника — цветом кольца вокруг портрета, без подписи. */
const RING: Record<ArcadeLevel, string> = {
  easy: '#3fd9c9',
  medium: '#ffd23f',
  boss: '#ff4b3e',
}

/**
 * Раздел аркады в холле — второй уровень рядом со «Сценариями»: тот же
 * заголовок, а зона начинается цветом продукта и уходит в ночную палитру
 * аркады. Ведёт в лобби аркады, где выбирают соперника.
 */
export function ArcadeTeaser() {
  return (
    <section className="mt-12" aria-labelledby="hall-arcade">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="hall-arcade" className="lbl">
          Аркада
        </h2>
        <span className="lbl sm:ml-auto">Более динамичный режим</span>
      </div>
      <a
        href="/arcade"
        className="press group mt-4 flex flex-col items-center gap-5 rounded-lg bg-[linear-gradient(135deg,#1e5c41_0%,#141a3c_70%)] px-5 py-6 sm:flex-row sm:justify-between sm:px-7"
      >
        <span className="flex items-center gap-3 sm:gap-4">
          {arcadeOpponents.map((o) => (
            <img
              key={o.scenario.id}
              src={`/arcade/thumb-${o.scenario.persona.portrait}`}
              alt={o.scenario.title}
              width={72}
              height={72}
              className="h-16 w-16 rounded-full object-cover transition-transform duration-200 sm:h-[72px] sm:w-[72px] [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.04]"
              style={{ boxShadow: `0 0 0 3px #141a3c, 0 0 0 6px ${RING[o.level]}` }}
            />
          ))}
        </span>
        <span className="flex h-12 w-full items-center justify-center rounded-md bg-[#ffd23f] px-8 font-['Dela_Gothic_One'] text-[16px] text-[#141a3c] transition-colors sm:w-auto [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-[#ffdc66]">
          Играть
        </span>
      </a>
    </section>
  )
}
