import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatDurationHours, formatLastActive, isOnline, ONLINE_THRESHOLD_MS } from "@/lib/time"

const NOW = new Date("2026-06-15T12:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("isOnline", () => {
  it("online se visto há menos de 5 minutos; nunca visto é offline", () => {
    expect(ONLINE_THRESHOLD_MS).toBe(5 * MIN)
    expect(isOnline(null)).toBe(false)
    expect(isOnline(ago(0))).toBe(true)
    expect(isOnline(ago(5 * MIN - 1))).toBe(true)
    expect(isOnline(ago(5 * MIN))).toBe(false)
    expect(isOnline(ago(2 * HOUR))).toBe(false)
  })
})

describe("formatLastActive", () => {
  it("escolhe a unidade e o plural certos", () => {
    expect(formatLastActive(null)).toBe("Nunca acessou")
    expect(formatLastActive(ago(30_000))).toBe("há poucos segundos")
    expect(formatLastActive(ago(MIN))).toBe("há 1 minuto")
    expect(formatLastActive(ago(59 * MIN))).toBe("há 59 minutos")
    expect(formatLastActive(ago(60 * MIN))).toBe("há 1 hora")
    expect(formatLastActive(ago(23 * HOUR + 59 * MIN))).toBe("há 23 horas")
    expect(formatLastActive(ago(24 * HOUR))).toBe("há 1 dia")
    expect(formatLastActive(ago(5 * DAY))).toBe("há 5 dias")
  })
})

describe("formatDurationHours", () => {
  it("duração média em horas ou dias, arredondada", () => {
    expect(formatDurationHours(0)).toBe("menos de 1 hora")
    expect(formatDurationHours(0.99)).toBe("menos de 1 hora")
    expect(formatDurationHours(1)).toBe("1 hora")
    expect(formatDurationHours(1.4)).toBe("1 hora")
    expect(formatDurationHours(2.6)).toBe("3 horas")
    expect(formatDurationHours(23.4)).toBe("23 horas")
    expect(formatDurationHours(24)).toBe("1 dia")
    expect(formatDurationHours(60)).toBe("3 dias")
  })
})
