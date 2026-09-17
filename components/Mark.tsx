/**
 * Знак «Арены».
 *
 * Рамка осей, граница возможного и точка сделки на ней — тот же рисунок,
 * что игрок видит на карте арены в разборе. Знак читается с 16 пикселей,
 * поэтому им же сделана фавиконка (`app/icon.svg`).
 */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden focusable="false">
      <rect width="32" height="32" rx="7" fill="var(--color-accent)" />
      <path d="M7 6.5V25.5H26" stroke="var(--color-accent-line)" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      <path d="M7.5 7C7.5 15.5 16.5 24.5 25 24.5" stroke="var(--color-paper)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="13.2" cy="19.6" r="3" fill="var(--color-paper)" />
      <circle cx="13.2" cy="19.6" r="1.5" fill="var(--color-accent)" />
    </svg>
  )
}
