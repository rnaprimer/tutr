import { Information, information } from '@/components/information'
export const metadata = { title: information['onboarding-policy'].title }
export default function Page() {
  return <Information slug="onboarding-policy" />
}
