"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search } from "lucide-react"
import { searchUsers, setUserRole } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Row = {
  id: string
  name: string
  email: string
  role: string
  createdAt: Date
}

const ROLE_OPTIONS = [
  { value: "user", label: "Usuário" },
  { value: "moderator", label: "Moderador" },
  { value: "admin", label: "Administrador" },
]

/**
 * Promoção de cargos. O cargo de moderador é o que libera o histórico
 * compartilhado das disputas, então a mudança é registrada aqui e aplicada no
 * servidor por um administrador.
 */
export function RoleManager({
  initialUsers,
  currentAdminId,
}: {
  initialUsers: Row[]
  currentAdminId: string
}) {
  const router = useRouter()
  const [term, setTerm] = useState("")
  const [rows, setRows] = useState(initialUsers)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  function search() {
    start(async () => {
      setRows(await searchUsers(term))
    })
  }

  function changeRole(userId: string, role: string) {
    setFeedback(null)
    start(async () => {
      const result = await setUserRole({ userId, role })
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Não foi possível alterar." })
        return
      }
      setRows((current) =>
        current.map((row) => (row.id === userId ? { ...row, role } : row)),
      )
      setFeedback({ ok: true, text: result.message ?? "Cargo atualizado." })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) search()
          }}
          placeholder="Buscar por nome ou email"
          className="max-w-xs"
          aria-label="Buscar usuários"
        />
        <Button variant="outline" onClick={search} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Buscar
        </Button>
      </div>

      {feedback ? (
        <p
          role="status"
          className={
            feedback.ok
              ? "text-sm text-primary"
              : "text-sm text-destructive"
          }
        >
          {feedback.text}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{row.name}</span>
              <span className="truncate text-xs text-muted-foreground">{row.email}</span>
            </div>

            <Select
              value={row.role}
              onValueChange={(value) => {
                if (value && value !== row.role) changeRole(row.id, value)
              }}
            >
              <SelectTrigger
                className="w-44"
                aria-label={`Cargo de ${row.name}`}
                disabled={pending || row.id === currentAdminId}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum usuário encontrado.
        </p>
      ) : null}
    </div>
  )
}
