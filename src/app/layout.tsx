import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AI Whip | Stop prompting. Start managing.", description: "Your AI said it's done. We checked. Evidence-driven coding-agent management." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
