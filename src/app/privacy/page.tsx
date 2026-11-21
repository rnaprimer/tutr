import { Information, information } from '@/components/information'
export const metadata = { title: information['privacy'].title }
export default function Page() {
  return <Information slug="privacy" />
}
