import { Information, information } from '@/components/information'
export const metadata = { title: information['data-rights'].title }
export default function Page() {
  return <Information slug="data-rights" />
}
