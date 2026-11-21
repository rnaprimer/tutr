import type { Metadata } from 'next'
import { brand } from '@/lib/brand'
import { SiteFooter, SiteHeader } from '@/components/site'
import '@fontsource-variable/geist'
import '@fontsource-variable/fraunces'
import './globals.css'

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: `Discover and request in-person tutors for Classes 1–12 in ${brand.city}.`,
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
