"use client"
import { useSearchParams } from "next/navigation"

export default function ClientSearchWrapper({ children }: { children: (providerId: string | null) => React.ReactNode }) {
  const params = useSearchParams()
  const providerId = params.get("providerId")
  return <>{children(providerId)}</>
}

