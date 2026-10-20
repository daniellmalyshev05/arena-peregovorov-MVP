import Link from 'next/link'
import { Mark } from '@/components/Mark'

export const metadata = {
  title: 'Такой страницы нет — Арена',
}

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="rise flex max-w-[420px] flex-col items-center text-center">
        <Mark size={56} />
        <h1 className="mt-6 text-h2 font-semibold tracking-[-0.016em] text-ink">Такой страницы нет</h1>
        <p className="mt-3 text-body text-ink2">
          Возможно, в ссылке опечатка или кейс удалили. Все сценарии и аркада — на главной.
        </p>
        <Link
          href="/"
          className="press mt-7 flex h-12 items-center justify-center rounded-md bg-accent px-6 font-semibold text-white transition-colors hover:bg-accent/92"
        >
          На главную
        </Link>
      </div>
    </main>
  )
}
