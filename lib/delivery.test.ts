import { describe, expect, it } from "vitest"
import { DELIVERY_TIME_OPTIONS, hoursForDeliveryTime } from "@/lib/delivery"

describe("hoursForDeliveryTime", () => {
  it("retorna as horas de cada opção válida", () => {
    for (const option of DELIVERY_TIME_OPTIONS) {
      expect(hoursForDeliveryTime(option.label)).toBe(option.hours)
    }
  })

  it("retorna null pra um label desconhecido", () => {
    expect(hoursForDeliveryTime("Até 1 semana")).toBeNull()
    expect(hoursForDeliveryTime("")).toBeNull()
  })
})
