import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto de página mostrado pelas rotas `loading.tsx` enquanto o servidor busca os dados. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="flex min-h-screen flex-col"
      role="status"
      aria-busy="true"
      aria-label="Carregando"
    >
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="ml-auto h-8 w-24" />
        </div>
      </div>

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>

          <div className="flex flex-col gap-3">
            {Array.from({ length: rows }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
