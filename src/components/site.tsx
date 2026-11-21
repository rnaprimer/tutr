import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, BookOpenText, MapPin, Menu } from 'lucide-react'
import { actor } from '@/lib/auth'
import { brand } from '@/lib/brand'
import { Button } from './ui'

function Wordmark() {
  return (
    <Link href="/" className="wordmark">
      {brand.logo ? (
        <Image src={brand.logo} alt="" width={38} height={38} unoptimized />
      ) : (
        <span className="brand-mark">
          <BookOpenText size={21} strokeWidth={1.8} />
        </span>
      )}
      <span>{brand.name}</span>
    </Link>
  )
}
const nav = [
  ['/tutors', 'Find a tutor'],
  ['/how-it-works', 'How it works'],
  ['/become-a-tutor', 'Become a tutor'],
]
export async function SiteHeader() {
  const user = await actor()
  const account = user ? `/${user.role}/dashboard` : '/login'
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Wordmark />
        <nav className="nav-desktop" aria-label="Primary">
          {nav.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <Link href={account} className="nav-login">
            {user ? 'Dashboard' : 'Log in'}
          </Link>
          <Button asChild>
            <Link href="/parent/requirements/new">
              Post a requirement <ArrowUpRight size={16} />
            </Link>
          </Button>
        </div>
        <details className="nav-mobile">
          <summary aria-label="Menu">
            <Menu size={23} />
          </summary>
          <nav aria-label="Mobile">
            {nav.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <Link href={account}>{user ? 'Dashboard' : 'Log in'}</Link>
            <Link href="/parent/requirements/new">Post a requirement</Link>
          </nav>
        </details>
      </div>
    </header>
  )
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Wordmark />
            <p>Find in-person tutoring for Classes 1–12 in {brand.city}.</p>
            <span className="footer-location">
              <MapPin size={15} /> {brand.city}, {brand.region}
            </span>
          </div>
          <div>
            <h2>Explore</h2>
            <Link href="/tutors">Find a tutor</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/become-a-tutor">Become a tutor</Link>
          </div>
          <div>
            <h2>Support</h2>
            <Link href="/support">Help centre</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
          <div>
            <h2>Policies</h2>
            <Link href="/onboarding-policy">Onboarding &amp; refunds</Link>
            <Link href="/data-rights">Account &amp; data rights</Link>
          </div>
        </div>
        <div className="footer-bottom">
          © {new Date().getFullYear()} {brand.name}
        </div>
      </div>
    </footer>
  )
}
