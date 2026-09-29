import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

/**
 * Tudo que exige login, é de moderação, ou tem token na URL fica de fora
 * (o robots.txt é público, então nem o CAMINHO dessas páginas deveria vazer
 * aqui — mas o /admin já é protegido por auth, isto só evita indexação).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/painel",
        "/conta",
        "/carteira",
        "/pedidos",
        "/vender/",
        "/entrar",
        "/cadastro",
        "/esqueci-senha",
        "/redefinir-senha",
        "/completar-cadastro",
        "/verificar-email",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
