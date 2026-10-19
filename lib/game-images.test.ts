import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { GAME_BRAND_ICONS } from "@/lib/game-brand-icons"
import { GAME_IMAGE_SLUGS, gameImagePath } from "@/lib/game-images"
import { GAMES } from "@/lib/product-catalog"

const dir = path.join(process.cwd(), "public", "images", "jogos")

describe("imagens dos jogos", () => {
  it("toda imagem listada existe na pasta e toda imagem da pasta está listada", () => {
    for (const slug of GAME_IMAGE_SLUGS) expect(existsSync(path.join(dir, `${slug}.webp`)), slug).toBe(true)
    const onDisk = readdirSync(dir).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, ""))
    for (const slug of onDisk) expect(GAME_IMAGE_SLUGS.has(slug), `${slug} não está em GAME_IMAGE_SLUGS`).toBe(true)
  })

  it("só jogos do catálogo têm imagem ou marca (um slug errado de digitação nunca apareceria)", () => {
    const slugs = new Set(GAMES.map((g) => g.slug))
    for (const slug of GAME_IMAGE_SLUGS) expect(slugs.has(slug), slug).toBe(true)
    for (const slug of Object.keys(GAME_BRAND_ICONS)) expect(slugs.has(slug), slug).toBe(true)
  })

  it("uma imagem não esconde a marca do mesmo jogo (a ordem é imagem, marca, iniciais)", () => {
    for (const slug of Object.keys(GAME_BRAND_ICONS)) expect(GAME_IMAGE_SLUGS.has(slug), `${slug} tem imagem e marca`).toBe(false)
  })

  it("gameImagePath devolve o caminho público ou nulo", () => {
    const [first] = [...GAME_IMAGE_SLUGS]
    expect(gameImagePath(first)).toBe(`/images/jogos/${first}.webp`)
    expect(gameImagePath("jogo-que-nao-existe")).toBeNull()
  })
})
