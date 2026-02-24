"use client"

import { SessionProvider } from "@/components/session-provider"
import { AppSidebar } from "./app-sidebar"

export default function ClientAppSidebar() {
  return (
    <SessionProvider>
      <AppSidebar />
    </SessionProvider>
  )
}
