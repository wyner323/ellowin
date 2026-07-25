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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
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
