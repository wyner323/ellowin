import { describe, expect, it } from "vitest"
import { sniffImageMime } from "@/lib/image-sniff"

const bytes = (...v: number[]) => new Uint8Array(v)
const text = (s: string) => Array.from(s).map((c) => c.charCodeAt(0))

describe("sniffImageMime", () => {
  it("reconhece PNG, JPEG, WebP e AVIF pela assinatura", () => {
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png")
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg")
    expect(sniffImageMime(bytes(...text("RIFF"), 1, 2, 3, 4, ...text("WEBP")))).toBe("image/webp")
    expect(sniffImageMime(bytes(0, 0, 0, 0x1c, ...text("ftyp"), ...text("avif")))).toBe("image/avif")
    expect(sniffImageMime(bytes(0, 0, 0, 0x1c, ...text("ftyp"), ...text("avis")))).toBe("image/avif")
  })

  it("recusa conteúdo que só finge ser imagem (HTML, SVG, executável, vazio)", () => {
    expect(sniffImageMime(bytes(...text("<!doctype html>")))).toBeNull()
    expect(sniffImageMime(bytes(...text("<svg xmlns=")))).toBeNull()
    expect(sniffImageMime(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull()
    expect(sniffImageMime(bytes())).toBeNull()
  })

  it("RIFF que não é WebP (ex.: WAV) e ftyp de vídeo não passam", () => {
    expect(sniffImageMime(bytes(...text("RIFF"), 1, 2, 3, 4, ...text("WAVE")))).toBeNull()
    expect(sniffImageMime(bytes(0, 0, 0, 0x18, ...text("ftyp"), ...text("mp42")))).toBeNull()
  })
})
