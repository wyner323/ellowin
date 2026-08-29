"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { updateAccentColor } from "@/app/actions/account"
import { ACCENT_COLORS, type AccentColorId } from "@/lib/accent-colors"
import { cn } from "@/lib/utils"

export function AccentColorPicker({ initialValue }: { initialValue: AccentColorId }) {
  const router = useRouter()
  const [value, setValue] = useState<AccentColorId>(initialValue)
  const [pending, start] = useTransition()

  function pick(id: AccentColorId) {
    if (id === value || pending) return
    setValue(id)
    start(async () => {
      await updateAccentColor({ accentColor: id })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Cor de destaque</span>
      <div className="flex items-center gap-2">
        {(Object.entries(ACCENT_COLORS) as [AccentColorId, (typeof ACCENT_COLORS)[AccentColorId]][]).map(
          ([id, color]) => (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              aria-label={color.label}
              aria-pressed={value === id}
              disabled={pending}
              className={cn(
                "flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110",
                value === id ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: color.hex ?? "var(--primary)" }}
            >
              {value === id ? (
                pending ? (
                  <Loader2 className="size-3.5 animate-spin text-white mix-blend-difference" />
                ) : (
                  <Check className="size-3.5 text-white mix-blend-difference" />
                )
              ) : null}
            </button>
          ),
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Destaca seu avatar e a sua loja pública.
      </p>
    </div>
  )
}
