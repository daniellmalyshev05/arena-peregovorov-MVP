import type { StrikeKind } from '@/lib/arcade/hud'

/** Иконки аркады: сетка 24, линия 2,4, скруглённые концы — одна манера на всё. */

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

type IconProps = { size?: number }
const sized = (size = 24) => ({ ...base, width: size, height: size })

export function IconQuestion({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  )
}

export function IconExchange({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M4 8h15l-4-4M20 16H5l4 4" />
    </svg>
  )
}

export function IconCriterion({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M4 18 18 4l2 2L6 20z" />
      <path d="M9 13l2 2M12 10l2 2M15 7l2 2" />
    </svg>
  )
}

export function IconListening({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M8 9a5 5 0 1 1 9 3c-1 1.4-2.6 2.2-2.6 4.2A2.8 2.8 0 0 1 9 17" />
      <path d="M11 9.5a2 2 0 1 1 3 1.7" />
    </svg>
  )
}

export function IconPressure({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M7 11V8a1.6 1.6 0 0 1 3.2 0v2M10.2 10V7a1.6 1.6 0 0 1 3.2 0v3M13.4 10V8a1.6 1.6 0 0 1 3.2 0v4" />
      <path d="M7 11v-.5a1.6 1.6 0 0 0-3 0V13a7 7 0 0 0 7 7h1a5 5 0 0 0 5-5v-3" />
    </svg>
  )
}

export function IconBluff({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M4 6c5-2 11-2 16 0v5c0 5-4 8-8 9-4-1-8-4-8-9z" />
      <path d="M8 11c.8-.6 1.7-.6 2.5 0M13.5 11c.8-.6 1.7-.6 2.5 0M9.5 15.5c1.6 1 3.4 1 5 0" />
    </svg>
  )
}

export function IconFlag({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M6 21V4" />
      <path d="M6 4c4-2 7 2 12 0v9c-5 2-8-2-12 0" />
    </svg>
  )
}

export function IconPackage({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </svg>
  )
}

export function IconShield({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M12 3 19.5 6v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z" />
    </svg>
  )
}

export function IconBolt({ size }: IconProps) {
  return (
    <svg {...sized(size)} fill="currentColor" stroke="none">
      <path d="M13.5 2 4.5 13.5H11L9.8 22l9.2-12h-6.5z" />
    </svg>
  )
}

export function IconClose({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconSend({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  )
}

export function IconSound({ on, size }: IconProps & { on: boolean }) {
  return (
    <svg {...sized(size)}>
      <path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" />
      {on ? <path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9.5l5 5M22 9.5l-5 5" />}
    </svg>
  )
}

export function IconLock({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function IconHelp({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M9 9a3 3 0 1 1 4.2 2.75c-.75.33-1.2 1.07-1.2 1.88V14" />
      <path d="M12 18h.01" />
    </svg>
  )
}

export function IconBack({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M19 12H6M11 6l-6 6 6 6" />
    </svg>
  )
}

export function StrikeIcon({ kind, size }: { kind: StrikeKind; size?: number }) {
  switch (kind) {
    case 'question':
      return <IconQuestion size={size} />
    case 'exchange':
      return <IconExchange size={size} />
    case 'criterion':
      return <IconCriterion size={size} />
    case 'listening':
      return <IconListening size={size} />
    case 'pressure':
      return <IconPressure size={size} />
    case 'bluff':
      return <IconBluff size={size} />
    case 'concession':
      return <IconFlag size={size} />
  }
}

/** Иконка урока: чему учит соперник. */
export function LessonIcon({ lesson, size }: { lesson: 'exchange' | 'questions' | 'criteria'; size?: number }) {
  if (lesson === 'exchange') return <IconExchange size={size} />
  if (lesson === 'questions') return <IconQuestion size={size} />
  return <IconCriterion size={size} />
}

export function IconEye({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function IconTrophy({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4M12 14v3.5M8.5 20.5h7M9.5 17.5h5" />
    </svg>
  )
}

export function IconFeather({ size }: IconProps) {
  return (
    <svg {...sized(size)}>
      <path d="M20 4c-7 0-13 4.5-14.5 12.5L4 20l3.5-1.5C15.5 17 20 11 20 4z" />
      <path d="M6.5 17.5 14 10" />
    </svg>
  )
}
