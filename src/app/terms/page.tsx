import { Information, information } from '@/components/information'
export const metadata = { title: information['terms'].title }
export default function Page() {
  return <Information slug="terms" />
}
