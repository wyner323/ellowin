import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Unbounded } from 'next/font/google'
import { DesignLab } from '@/components/dev/design-lab'
import { Toaster } from '@/components/ui/sonner'
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
  title: 'Ellowin — Marketplace de produtos digitais para games',
  description:
    'Compre e venda contas de jogos, moedas, gift cards e boosting com pagamento intermediado. Cadastro verificado por CPF e email.',
  generator: 'v0.app',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`bg-background ${inter.variable} ${unbounded.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-center" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
        {process.env.NODE_ENV === 'development' && <DesignLab />}
      </body>
    </html>
  )
}
