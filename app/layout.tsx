import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { Inter, Unbounded } from 'next/font/google'
import { DesignLab } from '@/components/dev/design-lab'
import { Toaster } from '@/components/ui/sonner'
import { SITE_URL } from '@/lib/site'
import { THEME_COOKIE, parseTheme, themeClass } from '@/lib/theme'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const unbounded = Unbounded({
  subsets: ['latin'],
  variable: '--font-unbounded',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Sem `template`: várias páginas (produto, loja, jogo, catálogo) já montam
  // o próprio "— Ellowin" no título — um template aqui duplicaria o sufixo.
  title: 'Ellowin — Marketplace de produtos digitais para games',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Ellowin',
  },
  description:
    'Compre e venda contas de jogos, moedas, gift cards e boosting com pagamento intermediado. Cadastro com CPF válido e e-mail confirmado.',
  icons: {
    icon: '/icon-32x32.png',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a0f2e' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // O tema escolhido fica num cookie para o servidor já mandar a classe certa (sem piscar).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html
      lang="pt-BR"
      className={`bg-background ${inter.variable} ${unbounded.variable} ${themeClass(theme)}`.trim()}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <a
          href="#conteudo"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Pular para o conteúdo
        </a>
        {children}
        <Toaster position="top-center" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
        {process.env.NODE_ENV === 'development' && <DesignLab />}
      </body>
    </html>
  )
}
