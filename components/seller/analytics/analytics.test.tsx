import { describe, expect, it } from "vitest"
import { renderHtml, htmlToText } from "@/lib/test-render"
import { delta } from "@/lib/analytics-math"
import { BarList } from "@/components/seller/analytics/bar-list"
import { Funnel } from "@/components/seller/analytics/funnel"
import { HealthMeter } from "@/components/seller/analytics/health-meter"
import { KpiCard } from "@/components/seller/analytics/kpi-card"
import { PeriodSelector } from "@/components/seller/analytics/period-selector"
import { Sparkline } from "@/components/seller/analytics/sparkline"
import { TimeSeriesChart } from "@/components/seller/analytics/time-series-chart"
import { formatValue } from "@/components/seller/analytics/format"

/**
 * Os blocos visuais do painel do vendedor renderizados de verdade (no servidor): o que se confere é o TEXTO que o
 * vendedor lê (números, veredito, direção) — nunca só a cor — e que nada quebra com dado vazio.
 */

const text = async (node: React.ReactNode) => htmlToText(await renderHtml(node))

describe("formatValue", () => {
  it("dinheiro, contagem, razão e horas; nulo vira traço", () => {
    expect(formatValue(12_345, "money")).toContain("123,45")
    expect(formatValue(1500, "count")).toBe("1.500")
    expect(formatValue(0.041, "ratio")).toBe("4,1%")
    expect(formatValue(3, "hours")).toBe("3 horas")
    expect(formatValue(null, "money")).toBe("—")
    expect(formatValue(Number.NaN, "count")).toBe("—")
  })
})

describe("KpiCard", () => {
  it("mostra número, apoio e a variação em texto (seta + sinal), e bom/ruim depende do sentido", async () => {
    const up = await renderHtml(<KpiCard label="Receita líquida" value="R$ 10,00" hint="3 vendas" delta={delta(120, 100)} />)
    expect(htmlToText(up)).toContain("+20% vs.")
    expect(up).toContain("text-success")
    const down = await renderHtml(<KpiCard label="Pedidos" value="5" delta={delta(80, 100)} />)
    expect(htmlToText(down)).toContain("−20%")
    expect(down).toContain("text-destructive")
    // para cancelamentos, subir é ruim
    const worse = await renderHtml(<KpiCard label="Cancelamentos" value="9%" delta={delta(9, 4)} goodWhen="down" />)
    expect(worse).toContain("text-destructive")
  })

  it("sem base de comparação e sem mudança dizem isso em palavras", async () => {
    expect(await text(<KpiCard label="x" value="1" delta={delta(10, 0)} />)).toContain("sem base de comparação")
    expect(await text(<KpiCard label="x" value="1" delta={delta(10, 10)} />)).toContain("igual ao período anterior")
  })

  it("a miniatura é decorativa (escondida de leitor de tela) e não quebra sem dado", async () => {
    for (const values of [[], [0, 0, 0], [5], [1, 3, 2, 8]]) {
      const html = await renderHtml(<Sparkline values={values} />)
      expect(html).toContain('aria-hidden="true"')
      expect(html).not.toMatch(/NaN|undefined/)
    }
  })
})

describe("BarList", () => {
  it("ordem recebida, valor em texto, parcela do total e dica", async () => {
    const t = await text(<BarList kind="money" emptyText="nada" rows={[{ label: "Valorant", value: 7500, hint: "3 vendas" }, { label: "Roblox", value: 2500 }]} />)
    expect(t.indexOf("Valorant")).toBeLessThan(t.indexOf("Roblox"))
    expect(t).toContain("75% do total · 3 vendas")
    expect(t).toContain("25% do total")
  })

  it("sem linhas ou só zeros mostra a mensagem vazia, sem barras", async () => {
    expect(await text(<BarList kind="money" emptyText="Nenhuma venda." rows={[]} />)).toBe("Nenhuma venda.")
    expect(await text(<BarList kind="count" emptyText="Zero." rows={[{ label: "a", value: 0 }]} />)).toBe("Zero.")
  })
})

describe("Funnel", () => {
  it("cada etapa em texto e a taxa de passagem entre elas", async () => {
    const t = await text(<Funnel emptyText="x" stages={[{ label: "visualizações", value: 1000 }, { label: "pedidos", value: 40 }, { label: "vendas concluídas", value: 30 }]} />)
    expect(t).toContain("1.000")
    expect(t).toContain("4% avançam para a próxima etapa")
    expect(t).toContain("75% avançam para a próxima etapa")
  })

  it("primeira etapa zerada não divide por zero", async () => {
    expect(await text(<Funnel emptyText="Sem pedidos." stages={[{ label: "pedidos", value: 0 }, { label: "vendas", value: 0 }]} />)).toBe("Sem pedidos.")
  })
})

describe("HealthMeter", () => {
  it("veredito em palavras com ícone: dentro da meta, fora da meta e sem dados", async () => {
    expect(await text(<HealthMeter label="Entregas no prazo" value={94} target={90} goodWhen="high" />)).toContain("Dentro da meta (90% ou mais)")
    expect(await text(<HealthMeter label="Entregas no prazo" value={70} target={90} goodWhen="high" />)).toContain("Abaixo da meta de 90%")
    expect(await text(<HealthMeter label="Cancelamentos" value={9} target={5} goodWhen="low" />)).toContain("Acima da meta de 5%")
    expect(await text(<HealthMeter label="Cancelamentos" value={2} target={5} goodWhen="low" />)).toContain("Dentro da meta (até 5%)")
    const none = await text(<HealthMeter label="Disputas" value={null} target={3} goodWhen="low" />)
    expect(none).toContain("Sem dados no período")
    expect(none).toContain("—")
  })

  it("mostra a mudança em pontos contra o período anterior", async () => {
    expect(await text(<HealthMeter label="x" value={94} previous={88} target={90} goodWhen="high" />)).toContain("+6% pts vs. período anterior")
  })
})

describe("PeriodSelector", () => {
  it("links para 7, 30 e 90 dias; o ativo leva aria-current", async () => {
    const html = await renderHtml(<PeriodSelector basePath="/painel/vendedor/analises" active={30} />)
    for (const p of [7, 30, 90]) expect(html).toContain(`/painel/vendedor/analises?periodo=${p}`)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-current="page"[^>]*>30 dias/)
  })
})

describe("TimeSeriesChart (render no servidor)", () => {
  const days = Array.from({ length: 10 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, value: i * 1000, previous: i * 800 }))

  it("tem título para leitor de tela, linha, área, pontos e rótulos de data — e nada de NaN", async () => {
    const html = await renderHtml(<TimeSeriesChart points={days} kind="money" label="Receita" summary="Receita por dia, total R$ 450,00" />)
    expect(html).toContain("<title")
    expect(html).toContain("Receita por dia, total R$ 450,00")
    expect(html).toContain("01/10")
    expect(html).toContain("10/10")
    expect(html).toMatch(/<path[^>]*stroke-width="2"/)
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })

  it("sem nenhum dia ou só zeros ainda desenha a grade sem quebrar", async () => {
    for (const points of [[], days.map((d) => ({ ...d, value: 0, previous: 0 }))]) {
      const html = await renderHtml(<TimeSeriesChart points={points} kind="count" label="Pedidos" mode="bars" summary="vazio" />)
      expect(html).not.toMatch(/NaN|undefined|Infinity/)
    }
  })
})
