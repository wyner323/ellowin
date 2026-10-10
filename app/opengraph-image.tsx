import { ImageResponse } from "next/og"

export const alt = "Ellowin — marketplace de produtos digitais para games"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0b0916 0%, #1c1432 100%)",
          color: "#f4f1ff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#a678ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              fontWeight: 800,
              color: "#0b0916",
            }}
          >
            E
          </div>
          <div style={{ fontSize: 52, fontWeight: 800 }}>Ellowin</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1 }}>
            O dinheiro só sai depois da entrega
          </div>
          <div style={{ fontSize: 32, color: "#b9afd6" }}>
            Contas de jogos, moedas, gift cards e boosting com pagamento intermediado.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#f2b53a" }}>
          <span>Nível do vendedor visível</span>
          <span>·</span>
          <span>Custódia até você confirmar</span>
        </div>
      </div>
    ),
    size,
  )
}
