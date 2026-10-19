import '@fontsource/dela-gothic-one/cyrillic-400.css'
import { arcadeOpponents } from '@/lib/arcade/opponents'

/**
 * Вход в аркаду из холла — второй по весу после симулятора: ниже ростом,
 * в ночной палитре аркады, чтобы было видно, что внутри другой режим.
 */
export function ArcadeTeaser() {
  return (
    <a
      href="/arcade"
      className="rise press group mt-3 flex flex-col gap-4 rounded-lg border-2 border-[#2b3570] bg-[#141a3c] bg-[radial-gradient(ellipse_70%_120%_at_20%_0%,#2c3a8a_0%,transparent_70%)] px-5 py-4 text-white transition-colors duration-200 sm:flex-row sm:items-center sm:gap-5 sm:px-6 [@media(hover:hover)_and_(pointer:fine)]:hover:border-[#ffd23f]"
    >
      <span className="flex items-center gap-4">
        <span aria-hidden className="flex shrink-0">
          {arcadeOpponents.map((o, i) => (
            <img
              key={o.scenario.id}
              src={`/arcade/thumb-${o.scenario.persona.portrait}`}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-full border-[3px] border-[#141a3c] object-cover"
              style={{ marginLeft: i ? -12 : 0, zIndex: 3 - i }}
            />
          ))}
        </span>
        <span className="font-['Dela_Gothic_One'] text-[22px] leading-none text-[#ffd23f]">Аркада</span>
      </span>
      <span className="min-w-0 flex-1 text-small text-[#aab3e6] text-pretty">Три соперника, две минуты на переговоры</span>
      <span className="flex h-11 shrink-0 items-center justify-center rounded-md bg-[#ffd23f] px-6 font-['Dela_Gothic_One'] text-[15px] text-[#141a3c] transition-colors group-hover:bg-[#ffdc66]">
        Играть
      </span>
    </a>
  )
}
