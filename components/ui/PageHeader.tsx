import type { ReactNode } from 'react'

export default function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="truncate text-[11.5px] font-medium text-gonper-muted">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[30px]">
          {title}
        </h1>
      </div>
      {action}
    </header>
  )
}
