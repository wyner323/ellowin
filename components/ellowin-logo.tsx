import { cn } from '@/lib/utils'

export function EllowinLogo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground"
      >
        E
      </span>
      <span className="font-display text-xl font-bold tracking-tight">
        Ellowin
      </span>
    </span>
  )
}
