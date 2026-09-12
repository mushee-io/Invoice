import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "BLACKOUT INVOICE", description: "Confidential commercial settlement on Midnight" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
