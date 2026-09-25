"use client"

import type { LucideIcon } from "lucide-react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Seção do formulário de anúncio: ícone, título, descrição e um selo de
 * "completa" que acende quando os campos obrigatórios da seção estão certos —
 * o vendedor vê o que já está pronto sem rolar a página inteira.
 */
export function FormSection({
  icon: Icon,
  title,
  description,
  complete,
  action,
  children,
  id,
}: {
  icon: LucideIcon
  title: string
  description?: string
  complete?: boolean
  action?: React.ReactNode
  children: React.ReactNode
  id?: string
}) {
  return (
    <section
      id={id}
      className="flex scroll-mt-24 flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
            complete ? "bg-success/15 text-success" : "bg-primary/15 text-primary",
          )}
          aria-hidden="true"
        >
          {complete ? <Check className="size-5" /> : <Icon className="size-5" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export type ChoiceOption = {
  value: string
  label: string
  description?: string
  icon?: LucideIcon
  /** Rótulo pequeno destacado (ex.: "Recomendado"). */
  tag?: string
}

/**
 * Grupo de opções em cartões (radio de verdade por baixo: teclado, leitor de
 * tela e foco funcionam sem código extra). Serve no lugar de um Select quando
 * há poucas opções e vale explicar cada uma.
 */
export function ChoiceCards({
  name,
  legend,
  value,
  onChange,
  options,
  columns = 2,
  disabled,
  compact,
  hideIndicator,
}: {
  name: string
  legend: string
  value: string
  onChange: (value: string) => void
  options: ChoiceOption[]
  columns?: 1 | 2 | 3 | 4
  disabled?: boolean
  compact?: boolean
  /** Sem a bolinha de seleção à direita (opções curtas, como os prazos). */
  hideIndicator?: boolean
}) {
  const grid = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  }[columns]

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      <div className={cn("grid gap-2.5", grid)}>
        {options.map((option) => {
          const Icon = option.icon
          const checked = option.value === value
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring/60",
                compact && "items-center p-3",
                checked
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {Icon ? (
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-4.5" />
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {option.label}
                  {option.tag ? (
                    <span className="rounded-full bg-gold px-1.5 py-px text-[0.65rem] font-medium text-gold-foreground">
                      {option.tag}
                    </span>
                  ) : null}
                </span>
                {option.description ? (
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {hideIndicator ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center self-start rounded-full border",
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {checked ? <Check className="size-3" /> : null}
                </span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Campo com rótulo, dica e contador — o padrão de todas as entradas do formulário. */
export function Field({
  label,
  htmlFor,
  hint,
  counter,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  counter?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm leading-none font-medium">
          {label}
        </label>
        {counter ? (
          <span className="text-xs text-muted-foreground tabular-nums">{counter}</span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
