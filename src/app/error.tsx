'use client'
import { Button, Empty } from '@/components/ui'
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container page">
      <Empty title="This page couldn’t load.">
        <Button onClick={reset}>Try again</Button>
      </Empty>
    </div>
  )
}
