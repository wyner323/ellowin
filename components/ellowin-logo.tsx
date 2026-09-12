import { cn } from '@/lib/utils'

export function EllowinLogo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="size-8 shrink-0 text-primary-foreground"
      >
        <path
          d="M50,6 C64,6 76,10 86,17 C86,50 78,78 50,94 C22,78 14,50 14,17 C24,10 36,6 50,6 Z"
          className="fill-primary"
        />
        <rect x="37" y="27" width="9" height="40" rx="4" fill="currentColor" />
        <rect x="37" y="27" width="26" height="9" rx="4" fill="currentColor" />
        <rect x="37" y="42.5" width="21" height="9" rx="4" fill="currentColor" />
        <rect x="37" y="58" width="26" height="9" rx="4" fill="currentColor" />
        <circle cx="50" cy="17" r="5" className="fill-gold" />
      </svg>
      <span className="font-display text-xl font-bold tracking-tight">
        Ellowin
      </span>
    </span>
  )
}
