"use client"

import { useEffect, useRef, useState } from "react"
import { Crosshair, Palette, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/**
 * Painel de ajuste visual ao vivo, só pra desenvolvimento (nunca renderiza em
 * produção — ver o gate em app/layout.tsx). Deixa trocar cor dos tokens do
 * tema, arrastar o enquadramento de imagens, editar/apagar/adicionar texto,
 * mexer em espaçamento/cantos/ordem de um elemento qualquer, e testar a
 * página inteira em outro zoom ou sem sombra/animação — tudo em cima do site
 * de verdade. Não escreve em disco sozinho: os botões "Copiar" geram o texto
 * pra colar no código ou mandar aqui no chat pra eu aplicar de fato.
 *
 * Cores e mudanças de elemento ficam salvas no localStorage do navegador
 * (chaves `ellowin-design-lab-*`) e voltam sozinhas ao recarregar a página —
 * é um rascunho que sobrevive à sessão, não uma mudança real no site. Os
 * ajustes da aba Página (zoom, sombra, animação) são só "olhar de um jeito" e
 * não são salvos.
 *
 * Importante: os tokens do tema definidos dentro de `@theme inline` no
 * globals.css (--radius-md, --font-display, --spacing, etc.) são resolvidos
 * pelo Tailwind/Lightning CSS em build time e não reagem a troca da variável
 * em runtime — só as variáveis "folha" do `:root`/`.dark` (--primary,
 * --background, --radius em si...) reagem. Por isso os ajustes de
 * espaçamento/cantos aqui são feitos por elemento (estilo inline direto), não
 * por token global — é o jeito que realmente funciona nesse projeto.
 */

type SavedElementChange = {
  selector: string
  label: string
  ts: number
  objectPosition?: string
  padding?: string
  borderRadius?: string
  hidden?: boolean
  removed?: boolean
  text?: string
  /** Presente só pra texto adicionado do zero: seletor de quem fica antes dele. */
  newAfter?: string
}

const COLORS_KEY = "ellowin-design-lab-colors"
const ELEMENTS_KEY = "ellowin-design-lab-elements"
const MOVES_KEY = "ellowin-design-lab-moves"

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/** Caminho estável (nth-child a partir do body) pra reencontrar o elemento depois de recarregar a página. */
function getSelectorPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node !== document.body && node.parentElement) {
    const parentEl: Element = node.parentElement
    const siblings: Element[] = Array.from(parentEl.children)
    const index = siblings.indexOf(node) + 1
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`)
    node = parentEl
  }
  return parts.length ? `body > ${parts.join(" > ")}` : "body"
}

const TOKEN_GROUPS: { title: string; tokens: { key: string; label: string }[] }[] = [
  {
    title: "Base",
    tokens: [
      { key: "background", label: "Fundo" },
      { key: "foreground", label: "Texto principal" },
      { key: "card", label: "Fundo de card" },
      { key: "muted", label: "Fundo suave" },
      { key: "muted-foreground", label: "Texto suave" },
      { key: "border", label: "Borda" },
      { key: "ring", label: "Anel de foco" },
    ],
  },
  {
    title: "Marca",
    tokens: [
      { key: "primary", label: "Primária" },
      { key: "primary-foreground", label: "Texto sobre primária" },
      { key: "secondary", label: "Secundária" },
      { key: "secondary-foreground", label: "Texto sobre secundária" },
      { key: "accent", label: "Destaque" },
      { key: "accent-foreground", label: "Texto sobre destaque" },
    ],
  },
  {
    title: "Status",
    tokens: [
      { key: "destructive", label: "Erro" },
      { key: "success", label: "Sucesso" },
    ],
  },
]

const ALL_TOKEN_KEYS = TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => t.key))

type Mode = "light" | "dark"
type Overrides = Record<Mode, Record<string, string>>

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

function round(n: number, d: number) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

function formatOklch(L: number, C: number, H: number, alpha: string) {
  return `oklch(${round(L, 3)} ${round(C, 3)} ${round(H, 1)}${alpha ? " " + alpha : ""})`
}

function rgbToHex(r: number, g: number, b: number) {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

let probeCtx: CanvasRenderingContext2D | null = null
function getProbeCtx() {
  if (!probeCtx) {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    probeCtx = canvas.getContext("2d", { willReadFrequently: true })
  }
  return probeCtx
}

/**
 * Lê a cor real de um token via canvas, em vez de fazer parse do texto do
 * custom property: o Tailwind/Lightning CSS reescreve `oklch(...)` pra
 * `lab(...)` (ou outro formato) no CSS final — inclusive no valor bruto do
 * custom property e no `.color` computado — então não dá pra confiar num
 * regex pra um formato só. `ctx.fillStyle` aceita qualquer sintaxe de cor
 * válida do CSS, e o pixel lido de volta já vem em sRGB de verdade.
 */
function readTokenColor(key: string): { hex: string; alpha: string } {
  // Desliga a stylesheet de cores salvas enquanto lê, senão um token já
  // customizado numa sessão anterior seria lido como se fosse o "original".
  const savedTag = document.getElementById("design-lab-saved-colors") as HTMLStyleElement | null
  const wasDisabled = savedTag?.disabled ?? false
  if (savedTag) savedTag.disabled = true

  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim()
  const ctx = getProbeCtx()
  let result = { hex: "#000000", alpha: "" }
  if (ctx && raw) {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = "#000000"
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    const alpha = a < 254 ? `/ ${round((a / 255) * 100, 0)}%` : ""
    result = { hex: rgbToHex(r, g, b), alpha }
  }

  if (savedTag) savedTag.disabled = wasDisabled
  return result
}

function hexToOklch(hex: string, alpha: string) {
  const clean = hex.replace("#", "")
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  const toLinear = (c: number) => {
    c = c / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const rl = toLinear(r)
  const gl = toLinear(g)
  const bll = toLinear(b)
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bll
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bll
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bll
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const C = Math.sqrt(a * a + b2 * b2)
  let H = (Math.atan2(b2, a) * 180) / Math.PI
  if (H < 0) H += 360
  return formatOklch(L, C, H, alpha)
}

export function DesignLab() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"cores" | "elementos" | "pagina" | "salvos">("cores")
  const [mode, setMode] = useState<Mode>("light")
  const [overrides, setOverrides] = useState<Overrides>(() => loadJSON(COLORS_KEY, { light: {}, dark: {} }))
  const baselineRef = useRef<Record<string, { hex: string; alpha: string }>>({})
  const [, forceRender] = useState(0)

  const [selecting, setSelecting] = useState(false)
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [rect, setRect] = useState<DOMRect | null>(null)
  const draggingRef = useRef(false)
  const originalObjectPositionRef = useRef<string>("")
  const selectorRef = useRef("")

  const [paddingPx, setPaddingPx] = useState(0)
  const [radiusPx, setRadiusPx] = useState(0)
  const [elHidden, setElHidden] = useState(false)
  const [elRemoved, setElRemoved] = useState(false)
  const [editingText, setEditingText] = useState(false)
  const originalElStyleRef = useRef({ padding: "", borderRadius: "", display: "", text: "" })
  const removedRef = useRef<{ parent: Element; next: Element | null } | null>(null)
  const isNewRef = useRef(false)
  const newAfterSelectorRef = useRef("")

  const [elementChanges, setElementChanges] = useState<Record<string, SavedElementChange>>(() => loadJSON(ELEMENTS_KEY, {}))
  const [moveNotes, setMoveNotes] = useState<string[]>(() => loadJSON(MOVES_KEY, []))
  const reappliedRef = useRef(false)

  const [zoom, setZoom] = useState(100)
  const [noShadows, setNoShadows] = useState(false)
  const [noAnimations, setNoAnimations] = useState(false)
  const [outlineAll, setOutlineAll] = useState(false)

  // Cores salvas ficam sempre ativas (independente do painel estar aberto) —
  // é o rascunho persistido, não uma pré-visualização. O forçar claro/escuro
  // continua só valendo com o painel aberto, é a lupa de "como fica nesse
  // tema", não uma decisão salva.
  useEffect(() => {
    const STYLE_ID = "design-lab-saved-colors"
    const css = buildSavedColorsCss()
    let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!css) {
      tag?.remove()
      return
    }
    if (!tag) {
      tag = document.createElement("style")
      tag.id = STYLE_ID
      document.head.appendChild(tag)
    }
    tag.textContent = css
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides])

  useEffect(() => {
    saveJSON(COLORS_KEY, overrides)
  }, [overrides])

  useEffect(() => {
    saveJSON(ELEMENTS_KEY, elementChanges)
  }, [elementChanges])

  useEffect(() => {
    saveJSON(MOVES_KEY, moveNotes)
  }, [moveNotes])

  // Reaplica o rascunho salvo de elementos uma vez, quando a página carrega.
  useEffect(() => {
    if (reappliedRef.current) return
    reappliedRef.current = true
    for (const change of Object.values(elementChanges)) {
      if (change.newAfter) {
        if (document.querySelector(change.selector)) continue
        const after = document.querySelector(change.newAfter)
        if (!after) continue
        const p = document.createElement("p")
        p.textContent = change.text ?? "Novo texto"
        after.after(p)
        continue
      }
      const el = document.querySelector(change.selector) as HTMLElement | null
      if (!el) continue
      if (change.removed) {
        el.remove()
        continue
      }
      if (change.padding) el.style.padding = change.padding
      if (change.borderRadius) el.style.borderRadius = change.borderRadius
      if (change.hidden) el.style.display = "none"
      if (change.objectPosition) el.style.objectPosition = change.objectPosition
      if (change.text !== undefined) el.textContent = change.text
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Forçar o tema claro/escuro só vale com o painel aberto — é só a lupa pra
  // conferir cada modo enquanto edita, não uma mudança salva.
  useEffect(() => {
    if (!open) {
      document.documentElement.classList.remove("light", "dark")
      return
    }

    document.documentElement.classList.toggle("dark", mode === "dark")
    document.documentElement.classList.toggle("light", mode === "light")

    for (const key of ALL_TOKEN_KEYS) {
      const cacheKey = `${mode}:${key}`
      if (baselineRef.current[cacheKey] === undefined) {
        baselineRef.current[cacheKey] = readTokenColor(key)
      }
    }
    forceRender((n) => n + 1)
  }, [open, mode])

  // Zoom e os toggles de página (sombra/animação/contorno) só valem enquanto
  // o painel está aberto — são "olhar de um jeito", não um rascunho de edição
  // como os ajustes de elemento.
  useEffect(() => {
    if (!open) {
      document.body.style.removeProperty("zoom")
      return
    }
    document.body.style.setProperty("zoom", String(zoom / 100))
  }, [open, zoom])

  useEffect(() => {
    const STYLE_ID = "design-lab-page-style"
    if (!open || (!noShadows && !noAnimations && !outlineAll)) {
      document.getElementById(STYLE_ID)?.remove()
      return
    }
    let css = ""
    if (noShadows) css += "*, *::before, *::after { box-shadow: none !important; }\n"
    if (noAnimations) css += "*, *::before, *::after { transition: none !important; animation: none !important; }\n"
    if (outlineAll) css += "*:not([data-design-lab-ui] *) { outline: 1px solid rgba(236,72,153,.5) !important; outline-offset: -1px; }\n"
    let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!tag) {
      tag = document.createElement("style")
      tag.id = STYLE_ID
      document.head.appendChild(tag)
    }
    tag.textContent = css
  }, [open, noShadows, noAnimations, outlineAll])

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("light", "dark")
      document.body.style.removeProperty("zoom")
      document.getElementById("design-lab-page-style")?.remove()
    }
  }, [])

  function currentHex(key: string) {
    return overrides[mode][key] ?? baselineRef.current[`${mode}:${key}`]?.hex ?? "#000000"
  }

  function handleColorChange(key: string, hex: string) {
    setOverrides((prev) => ({ ...prev, [mode]: { ...prev[mode], [key]: hex } }))
  }

  function resetToken(key: string, m: Mode = mode) {
    setOverrides((prev) => {
      const next = { ...prev[m] }
      delete next[key]
      return { ...prev, [m]: next }
    })
  }

  function resetAll() {
    setOverrides({ light: {}, dark: {} })
    toast("Cores resetadas para o padrão do código.")
  }

  function cssBlock(m: Mode) {
    const entries = Object.entries(overrides[m])
    if (!entries.length) return ""
    const lines = entries.map(([key, hex]) => {
      const alpha = baselineRef.current[`${m}:${key}`]?.alpha ?? ""
      return `  --${key}: ${hexToOklch(hex, alpha)};`
    })
    return `${m === "light" ? ":root" : ".dark"} {\n${lines.join("\n")}\n}\n`
  }

  /**
   * Versão pra injetar ao vivo: usa `!important` (senão perde pra regra de
   * modo escuro do próprio globals.css, que tem especificidade maior via
   * `:root:not(.light)`) e replica esse mesmo seletor pro "dark" — porque o
   * sistema pode estar em modo escuro só pela preferência do SO, sem a classe
   * `.dark` presente, e é esse caminho que precisa ser coberto também.
   */
  function buildSavedColorsCss() {
    let css = ""
    const lightEntries = Object.entries(overrides.light)
    if (lightEntries.length) {
      const lines = lightEntries.map(([key, hex]) => {
        const alpha = baselineRef.current[`light:${key}`]?.alpha ?? ""
        return `  --${key}: ${hexToOklch(hex, alpha)} !important;`
      })
      // Claro vale quando o SO não prefere escuro (e a classe .dark não foi
      // forçada), ou quando .light foi forçada explicitamente por cima de um
      // SO escuro — sem isso, !important faz o claro vazar pro escuro.
      css += `@media not (prefers-color-scheme: dark) {\n  :root:not(.dark) {\n${lines.join("\n")}\n  }\n}\n`
      css += `:root.light {\n${lines.join("\n")}\n}\n`
    }
    const darkEntries = Object.entries(overrides.dark)
    if (darkEntries.length) {
      const lines = darkEntries.map(([key, hex]) => {
        const alpha = baselineRef.current[`dark:${key}`]?.alpha ?? ""
        return `  --${key}: ${hexToOklch(hex, alpha)} !important;`
      })
      css += `.dark {\n${lines.join("\n")}\n}\n`
      css += `@media (prefers-color-scheme: dark) {\n  :root:not(.light) {\n${lines.join("\n")}\n  }\n}\n`
    }
    return css
  }

  function copyCss() {
    const out = cssBlock("light") + (Object.keys(overrides.dark).length ? "\n" + cssBlock("dark") : "")
    if (!out) {
      toast.error("Nenhuma cor foi alterada ainda.")
      return
    }
    navigator.clipboard.writeText(out)
    toast.success("CSS copiado — cole aqui no chat ou em app/globals.css.")
  }

  // --- Elementos (enquadramento de imagem, ou espaçamento/cantos/ordem de qualquer outro) ---

  const isImage = selectedEl?.tagName === "IMG"

  useEffect(() => {
    if (!selecting) return
    let hovered: HTMLElement | null = null

    function pick(e: Event) {
      const target = e.target as HTMLElement
      if (target.closest?.("[data-design-lab-ui]")) return null
      return (target.closest?.("img") as HTMLElement | null) ?? target
    }

    function onOver(e: MouseEvent) {
      const el = pick(e)
      if (hovered && hovered !== el) hovered.style.outline = ""
      hovered = el
      if (hovered) {
        hovered.style.outline = "2px solid #8b5cf6"
        hovered.style.outlineOffset = "1px"
      }
    }

    function onClick(e: MouseEvent) {
      const el = pick(e)
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      el.style.outline = ""
      selectorRef.current = getSelectorPath(el)
      isNewRef.current = false
      if (el.tagName === "IMG") {
        const img = el as HTMLImageElement
        const computed = getComputedStyle(img).objectPosition
        const parts = computed.split(" ").map((p) => parseFloat(p))
        originalObjectPositionRef.current = img.style.objectPosition
        setPos({ x: Number.isFinite(parts[0]) ? parts[0] : 50, y: Number.isFinite(parts[1]) ? parts[1] : 50 })
        setRect(img.getBoundingClientRect())
      } else {
        const cs = getComputedStyle(el)
        const initialPadding = Math.round(parseFloat(cs.paddingTop) || 0)
        const initialRadius = Math.round(parseFloat(cs.borderTopLeftRadius) || 0)
        // Guarda o valor que o stepper vai forçar de volta (não o inline cru,
        // que costuma estar vazio) — senão "0px" forçado pelo stepper conta
        // como mudança em relação a "" e fica salvo à toa.
        originalElStyleRef.current = {
          padding: `${initialPadding}px`,
          borderRadius: `${initialRadius}px`,
          display: el.style.display,
          text: el.textContent ?? "",
        }
        setPaddingPx(initialPadding)
        setRadiusPx(initialRadius)
        setElHidden(false)
        setElRemoved(false)
        setEditingText(false)
      }
      setSelectedEl(el)
      setSelecting(false)
    }

    document.addEventListener("mouseover", onOver, true)
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("mouseover", onOver, true)
      document.removeEventListener("click", onClick, true)
      if (hovered) hovered.style.outline = ""
    }
  }, [selecting])

  useEffect(() => {
    if (!selectedEl || !isImage) return
    const update = () => setRect(selectedEl.getBoundingClientRect())
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [selectedEl, isImage])

  useEffect(() => {
    if (!selectedEl || !isImage) return
    selectedEl.style.objectPosition = `${round(pos.x, 1)}% ${round(pos.y, 1)}%`
  }, [pos, selectedEl, isImage])

  useEffect(() => {
    if (!selectedEl || isImage) return
    selectedEl.style.padding = `${paddingPx}px`
  }, [paddingPx, selectedEl, isImage])

  useEffect(() => {
    if (!selectedEl || isImage) return
    selectedEl.style.borderRadius = `${radiusPx}px`
  }, [radiusPx, selectedEl, isImage])

  useEffect(() => {
    if (!selectedEl || isImage) return
    selectedEl.style.display = elHidden ? "none" : originalElStyleRef.current.display
  }, [elHidden, selectedEl, isImage])

  useEffect(() => {
    if (!selectedEl || isImage) return
    selectedEl.contentEditable = editingText ? "true" : "false"
    if (editingText) {
      selectedEl.focus()
      const range = document.createRange()
      range.selectNodeContents(selectedEl)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    return () => {
      selectedEl.contentEditable = "false"
    }
  }, [editingText, selectedEl, isImage])

  function onOverlayDrag(e: React.MouseEvent) {
    draggingRef.current = true
    updateFromPointer(e.clientX, e.clientY)
  }

  function updateFromPointer(clientX: number, clientY: number) {
    if (!rect) return
    const x = clamp01((clientX - rect.left) / rect.width) * 100
    const y = clamp01((clientY - rect.top) / rect.height) * 100
    setPos({ x: round(x, 1), y: round(y, 1) })
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return
      updateFromPointer(e.clientX, e.clientY)
    }
    function onUp() {
      draggingRef.current = false
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [rect])

  function finishSelection() {
    setSelectedEl(null)
    setRect(null)
    setElRemoved(false)
    setEditingText(false)
  }

  function revertSelection() {
    if (selectedEl) {
      if (elRemoved && removedRef.current) {
        removedRef.current.parent.insertBefore(selectedEl, removedRef.current.next)
      } else if (isImage) {
        selectedEl.style.objectPosition = originalObjectPositionRef.current
      } else {
        selectedEl.style.padding = originalElStyleRef.current.padding
        selectedEl.style.borderRadius = originalElStyleRef.current.borderRadius
        selectedEl.style.display = originalElStyleRef.current.display
        selectedEl.textContent = originalElStyleRef.current.text
      }
    }
    discardElementChange(selectorRef.current)
    finishSelection()
  }

  /** Salva o estado atual do elemento selecionado no rascunho (localStorage). */
  function computeElementChange(): SavedElementChange | null {
    if (!selectedEl || !selectorRef.current) return null
    const label = elementLabel(selectedEl)
    if (elRemoved) {
      return { selector: selectorRef.current, label, ts: Date.now(), removed: true }
    }
    if (isNewRef.current) {
      return { selector: selectorRef.current, label, ts: Date.now(), newAfter: newAfterSelectorRef.current, text: selectedEl.textContent ?? "" }
    }
    if (isImage) {
      const value = selectedEl.style.objectPosition
      if (!value || value === originalObjectPositionRef.current) return null
      return { selector: selectorRef.current, label, ts: Date.now(), objectPosition: value }
    }
    const o = originalElStyleRef.current
    const padding = selectedEl.style.padding && selectedEl.style.padding !== o.padding ? selectedEl.style.padding : undefined
    const borderRadius = selectedEl.style.borderRadius && selectedEl.style.borderRadius !== o.borderRadius ? selectedEl.style.borderRadius : undefined
    const hidden = elHidden || undefined
    const text = selectedEl.textContent !== o.text ? (selectedEl.textContent ?? "") : undefined
    if (!padding && !borderRadius && !hidden && text === undefined) return null
    return { selector: selectorRef.current, label, ts: Date.now(), padding, borderRadius, hidden, text }
  }

  function concludeAndSave() {
    const change = computeElementChange()
    if (change) {
      setElementChanges((prev) => ({ ...prev, [change.selector]: change }))
      toast.success("Salvo — fica guardado mesmo se recarregar a página.")
    }
    finishSelection()
  }

  function discardElementChange(selector: string) {
    if (!selector) return
    setElementChanges((prev) => {
      if (!(selector in prev)) return prev
      const next = { ...prev }
      delete next[selector]
      return next
    })
  }

  function removeElement() {
    if (!selectedEl?.parentElement) return
    removedRef.current = { parent: selectedEl.parentElement, next: selectedEl.nextElementSibling }
    selectedEl.remove()
    setEditingText(false)
    setElRemoved(true)
  }

  function insertTextAfter() {
    if (!selectedEl?.parentElement) return
    const afterSelector = selectorRef.current || getSelectorPath(selectedEl)
    const p = document.createElement("p")
    p.textContent = "Novo texto"
    selectedEl.parentElement.insertBefore(p, selectedEl.nextSibling)
    originalElStyleRef.current = { padding: "", borderRadius: "", display: "", text: "Novo texto" }
    selectorRef.current = getSelectorPath(p)
    newAfterSelectorRef.current = afterSelector
    isNewRef.current = true
    setPaddingPx(0)
    setRadiusPx(0)
    setElHidden(false)
    setElRemoved(false)
    setSelectedEl(p)
    setEditingText(true)
  }

  function copyObjectPosition() {
    navigator.clipboard.writeText(`object-position: ${round(pos.x, 1)}% ${round(pos.y, 1)}%;`)
    toast.success("object-position copiado.")
  }

  function elementLabel(el: HTMLElement) {
    const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""
    const text = el.textContent?.trim().slice(0, 30) ?? ""
    return `<${el.tagName.toLowerCase()}${cls}> ${text}`.trim()
  }

  function copyElementStyle() {
    if (!selectedEl) return
    navigator.clipboard.writeText(`padding: ${paddingPx}px;\nborder-radius: ${radiusPx}px;`)
    toast.success("Estilo copiado — me diga também qual elemento era (" + elementLabel(selectedEl) + ").")
  }

  function moveSibling(direction: "up" | "down") {
    if (!selectedEl?.parentElement) return
    const sibling = direction === "up" ? selectedEl.previousElementSibling : selectedEl.nextElementSibling
    if (!sibling) return
    if (direction === "up") selectedEl.parentElement.insertBefore(selectedEl, sibling)
    else selectedEl.parentElement.insertBefore(sibling, selectedEl)
    selectedEl.scrollIntoView({ block: "center", behavior: "smooth" })
    selectorRef.current = getSelectorPath(selectedEl)
    setMoveNotes((prev) => [...prev, `"${elementLabel(selectedEl)}" movido pra ${direction === "up" ? "cima" : "baixo"}`])
  }

  function copyAllSaved() {
    const css = cssBlock("light") + (Object.keys(overrides.dark).length ? "\n" + cssBlock("dark") : "")
    const changes = Object.values(elementChanges)
    let out = ""
    if (css) out += "CORES:\n" + css + "\n"
    if (changes.length) {
      out += "ELEMENTOS:\n"
      for (const c of changes) {
        out += `- ${c.label}\n`
        if (c.removed) out += `  remover este elemento\n`
        if (c.newAfter) out += `  texto novo adicionado: "${c.text}"\n`
        if (c.padding) out += `  padding: ${c.padding}\n`
        if (c.borderRadius) out += `  border-radius: ${c.borderRadius}\n`
        if (c.hidden) out += `  esconder (display: none)\n`
        if (c.objectPosition) out += `  object-position: ${c.objectPosition}\n`
        if (c.text !== undefined && !c.newAfter) out += `  novo texto: "${c.text}"\n`
      }
      out += "\n"
    }
    if (moveNotes.length) {
      out += "ORDEM:\n" + moveNotes.map((n) => `- ${n}`).join("\n") + "\n"
    }
    if (!out) {
      toast.error("Nada salvo ainda.")
      return
    }
    navigator.clipboard.writeText(out)
    toast.success("Copiado — cole aqui no chat pra eu avaliar o que aplicar no código.")
  }

  function clearAllSaved() {
    setOverrides({ light: {}, dark: {} })
    setElementChanges({})
    setMoveNotes([])
    toast("Rascunho salvo apagado.")
  }

  const savedCount = Object.keys(overrides.light).length + Object.keys(overrides.dark).length + Object.keys(elementChanges).length + moveNotes.length

  return (
    <>
      <button
        type="button"
        data-design-lab-ui
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[9998] flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,.25)" }}
        aria-label="Abrir Design Lab"
      >
        <Palette className="size-5" />
      </button>

      {open ? (
        <div data-design-lab-ui className="fixed bottom-20 right-4 z-[9998] flex w-80 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Design Lab</span>
              <span className="text-[11px] text-muted-foreground">Só em dev · cores e elementos ficam salvos</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setTab("cores")}
              className={cn("flex-1 py-2 text-xs font-medium", tab === "cores" ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}
            >
              Cores
            </button>
            <button
              type="button"
              onClick={() => setTab("elementos")}
              className={cn("flex-1 py-2 text-xs font-medium", tab === "elementos" ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}
            >
              Elementos
            </button>
            <button
              type="button"
              onClick={() => setTab("pagina")}
              className={cn("flex-1 py-2 text-xs font-medium", tab === "pagina" ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}
            >
              Página
            </button>
            <button
              type="button"
              onClick={() => setTab("salvos")}
              className={cn("flex-1 py-2 text-xs font-medium", tab === "salvos" ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}
            >
              Salvos{savedCount > 0 ? ` (${savedCount})` : ""}
            </button>
          </div>

          {tab === "cores" ? (
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-4">
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setMode("light")}
                  className={cn("flex-1 rounded-md py-1 text-xs font-medium", mode === "light" ? "bg-background shadow-sm" : "text-muted-foreground")}
                >
                  Claro
                </button>
                <button
                  type="button"
                  onClick={() => setMode("dark")}
                  className={cn("flex-1 rounded-md py-1 text-xs font-medium", mode === "dark" ? "bg-background shadow-sm" : "text-muted-foreground")}
                >
                  Escuro
                </button>
              </div>

              {TOKEN_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</span>
                  {group.tokens.map((token) => {
                    const hex = currentHex(token.key)
                    const changed = Boolean(overrides[mode][token.key])
                    return (
                      <div key={token.key} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={hex}
                          onChange={(e) => handleColorChange(token.key, e.target.value)}
                          className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                        />
                        <span className="flex-1 truncate text-xs">{token.label}</span>
                        {changed ? (
                          <button type="button" onClick={() => resetToken(token.key)} className="text-muted-foreground hover:text-foreground">
                            <RotateCcw className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))}

              <div className="mt-2 flex gap-2">
                <button type="button" onClick={copyCss} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                  Copiar CSS
                </button>
                <button type="button" onClick={resetAll} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                  Resetar
                </button>
              </div>
            </div>
          ) : null}

          {tab === "elementos" ? (
            <div className="flex flex-col gap-3 p-4">
              {!selectedEl ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Clique no botão e depois em qualquer elemento da página. Se for imagem, você ajusta o enquadramento arrastando; se for texto, dá pra editar, apagar ou adicionar; em qualquer caso dá pra mexer em espaçamento, cantos, esconder ou trocar de posição com o vizinho.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelecting((v) => !v)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
                      selecting ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
                    )}
                  >
                    <Crosshair className="size-4" />
                    {selecting ? "Clique num elemento…" : "Selecionar elemento"}
                  </button>
                </>
              ) : isImage ? (
                <>
                  <p className="truncate text-xs text-muted-foreground" title={(selectedEl as HTMLImageElement).currentSrc}>
                    {(selectedEl as HTMLImageElement).alt || (selectedEl as HTMLImageElement).currentSrc.split("/").pop()}
                  </p>
                  <p className="font-mono text-xs">
                    object-position: {round(pos.x, 1)}% {round(pos.y, 1)}%
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={copyObjectPosition} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                      Copiar
                    </button>
                    <button type="button" onClick={revertSelection} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                      Reverter
                    </button>
                    <button type="button" onClick={concludeAndSave} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                      Concluir
                    </button>
                  </div>
                </>
              ) : elRemoved ? (
                <>
                  <p className="text-xs text-muted-foreground">Elemento removido da página.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={revertSelection} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                      Reverter
                    </button>
                    <button type="button" onClick={concludeAndSave} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                      Concluir
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="truncate text-xs text-muted-foreground" title={elementLabel(selectedEl)}>
                    {elementLabel(selectedEl)}
                  </p>

                  {editingText ? (
                    <p className="rounded-lg bg-primary/10 px-2 py-1.5 text-xs text-primary">Editando — clique no texto na página e digite.</p>
                  ) : null}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingText((v) => !v)}
                      className={cn("flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium", editingText ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}
                    >
                      {editingText ? "Editando…" : "Editar texto"}
                    </button>
                    <button type="button" onClick={insertTextAfter} className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted">
                      Adicionar texto
                    </button>
                    <button type="button" onClick={removeElement} className="rounded-lg border border-destructive/40 px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                      Apagar
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span>Espaçamento interno</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPaddingPx((v) => Math.max(0, v - 4))} className="flex size-6 items-center justify-center rounded border border-border hover:bg-muted">−</button>
                      <span className="w-10 text-center font-mono">{paddingPx}px</span>
                      <button type="button" onClick={() => setPaddingPx((v) => v + 4)} className="flex size-6 items-center justify-center rounded border border-border hover:bg-muted">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span>Cantos arredondados</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setRadiusPx((v) => Math.max(0, v - 4))} className="flex size-6 items-center justify-center rounded border border-border hover:bg-muted">−</button>
                      <span className="w-10 text-center font-mono">{radiusPx}px</span>
                      <button type="button" onClick={() => setRadiusPx((v) => v + 4)} className="flex size-6 items-center justify-center rounded border border-border hover:bg-muted">+</button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => moveSibling("up")} className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted">
                      Mover ↑
                    </button>
                    <button type="button" onClick={() => moveSibling("down")} className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted">
                      Mover ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setElHidden((v) => !v)}
                      className={cn("flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium", elHidden ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}
                    >
                      {elHidden ? "Ocultado" : "Ocultar"}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={copyElementStyle} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                      Copiar
                    </button>
                    <button type="button" onClick={revertSelection} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                      Reverter
                    </button>
                    <button type="button" onClick={concludeAndSave} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                      Concluir
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {tab === "pagina" ? (
            <div className="flex flex-col gap-4 p-4">
              <p className="text-xs text-muted-foreground">
                Ajustes de olhada rápida na página inteira. Diferente da aba Elementos, eles não ficam de rascunho: fechar o painel desliga tudo.
              </p>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span>Zoom da página</span>
                  <span className="font-mono">{zoom}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <label className="flex items-center justify-between text-xs">
                <span>Sem sombras</span>
                <input type="checkbox" checked={noShadows} onChange={(e) => setNoShadows(e.target.checked)} className="accent-primary" />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Sem animações/transições</span>
                <input type="checkbox" checked={noAnimations} onChange={(e) => setNoAnimations(e.target.checked)} className="accent-primary" />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Contornar todos os elementos</span>
                <input type="checkbox" checked={outlineAll} onChange={(e) => setOutlineAll(e.target.checked)} className="accent-primary" />
              </label>
            </div>
          ) : null}

          {tab === "salvos" ? (
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-4">
              <p className="text-xs text-muted-foreground">
                Fica guardado no seu navegador e volta sozinho se você recarregar a página. Quando quiser aplicar de verdade no código, clica em "Copiar tudo" e me manda aqui no chat pra eu avaliar.
              </p>

              {savedCount === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Nada salvo ainda.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(["light", "dark"] as Mode[]).flatMap((m) =>
                    Object.entries(overrides[m]).map(([key, hex]) => (
                      <div key={`c-${m}-${key}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                        <span className="flex items-center gap-2 truncate">
                          <span className="size-3 shrink-0 rounded-full border border-border" style={{ background: hex }} />
                          Cor · {TOKEN_GROUPS.flatMap((g) => g.tokens).find((t) => t.key === key)?.label ?? key} ({m === "light" ? "claro" : "escuro"})
                        </span>
                        <button type="button" onClick={() => resetToken(key, m)} className="shrink-0 text-muted-foreground hover:text-destructive">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )),
                  )}

                  {Object.values(elementChanges).map((c) => (
                    <div key={c.selector} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                      <span className="truncate" title={c.label}>
                        {c.removed ? "Removido" : c.newAfter ? "Texto novo" : "Elemento"} · {c.label}
                      </span>
                      <button type="button" onClick={() => discardElementChange(c.selector)} className="shrink-0 text-muted-foreground hover:text-destructive">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}

                  {moveNotes.map((note, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                      <span className="truncate">Ordem · {note}</span>
                      <button
                        type="button"
                        onClick={() => setMoveNotes((prev) => prev.filter((_, idx) => idx !== i))}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <button type="button" onClick={copyAllSaved} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                  Copiar tudo
                </button>
                <button type="button" onClick={clearAllSaved} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                  Limpar tudo
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedEl && isImage && rect ? (
        <div
          onMouseDown={onOverlayDrag}
          className="fixed z-[9999] cursor-crosshair"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            outline: "2px dashed #8b5cf6",
            outlineOffset: "-2px",
          }}
        >
          <div
            className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#8b5cf6] shadow"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        </div>
      ) : null}
    </>
  )
}
