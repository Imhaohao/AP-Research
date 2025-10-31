import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AP Research Page - Prompt Engineering Study',
  description: 'A quasi-experimental prompt engineering study for AI literacy education',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

