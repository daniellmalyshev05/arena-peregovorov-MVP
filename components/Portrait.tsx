'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Портрет оппонента. Если файла в public/portraits нет, показываются инициалы —
 * сценарий остаётся играбельным без картинок.
 *
 * Инициалы — состояние по умолчанию, картинка проявляется поверх них только
 * после успешной загрузки. Иначе первый портрет рисуется на сервере, ошибка
 * загрузки приходит до гидрации, `onError` не срабатывает и на экране остаётся
 * иконка битой картинки.
 */
export function Portrait({
  name,
  file,
  size = 36,
  active = false,
}: {
  name: string
  file?: string
  size?: number
  active?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('')

  // Картинка из кеша может завершиться до подписки на onLoad.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [file])

  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-full bg-line2"
      style={{
        width: size,
        height: size,
        boxShadow: active ? '0 0 0 2px var(--color-accent-line)' : undefined,
        transition: 'box-shadow 200ms var(--ease-out)',
      }}
      aria-hidden
    >
      <span
        className="num absolute inset-0 flex items-center justify-center font-semibold text-ink2"
        style={{ fontSize: Math.round(size * 0.34) }}
      >
        {initials}
      </span>
      {file && (
        <img
          ref={imgRef}
          src={`/portraits/${file}`}
          alt=""
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            filter: 'saturate(0.82) contrast(1.03)',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 260ms var(--ease-out)',
          }}
        />
      )}
    </span>
  )
}
