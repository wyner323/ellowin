"use client"

import { useRef } from "react"
import { Input } from "@/components/ui/input"

export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = value.padEnd(6, " ").slice(0, 6).split("")

  function setDigit(index: number, digit: string) {
    const next = value.padEnd(6, " ").split("")
    next[index] = digit
    onChange(next.join("").replace(/\s/g, "").slice(0, 6))
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Código de 6 dígitos">
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            refs.current[index] = el
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          aria-label={`Dígito ${index + 1}`}
          value={digit.trim()}
          onChange={(event) => {
            const clean = event.target.value.replace(/\D/g, "")
            if (!clean) {
              setDigit(index, " ")
              return
            }
            if (clean.length > 1) {
              onChange(clean.slice(0, 6))
              refs.current[Math.min(clean.length, 5)]?.focus()
              return
            }
            setDigit(index, clean)
            if (index < 5) refs.current[index + 1]?.focus()
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digit.trim() && index > 0) {
              refs.current[index - 1]?.focus()
            }
          }}
          onPaste={(event) => {
            event.preventDefault()
            const pasted = event.clipboardData.getData("text").replace(/\D/g, "")
            if (pasted) {
              onChange(pasted.slice(0, 6))
              refs.current[Math.min(pasted.length, 5)]?.focus()
            }
          }}
          className="h-14 w-12 text-center text-xl font-semibold tabular-nums"
        />
      ))}
    </div>
  )
}
