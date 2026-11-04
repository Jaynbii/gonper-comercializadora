import type { ReactNode } from 'react'

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="text-gonper-muted">{icon}</div>
      <p className="mt-3 text-[14px] font-medium">{title}</p>
      <p className="mt-1 max-w-[36ch] text-[12.5px] leading-relaxed text-gonper-muted">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
