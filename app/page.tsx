import { headers } from 'next/headers'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import {
  CategoryGrid,
  FeaturedListings,
  GameStrip,
  Hero,
  HowItWorks,
  TrustSection,
} from '@/components/home-sections'
import { serializeJsonLd } from '@/lib/product-jsonld'
import { websiteJsonLd } from '@/lib/seo'

export default async function HomePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd()) }}
      />
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        <Hero />
        <CategoryGrid />
        <GameStrip />
        <FeaturedListings />
        <HowItWorks />
        <TrustSection />
      </main>
      <SiteFooter />
    </div>
  )
}
