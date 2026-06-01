import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LangProvider } from "@/contexts/lang-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mapa pogody dla rowerzystów",
  description: "Alerty pogodowe na trasie rowerowej",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden flex flex-col bg-white dark:bg-slate-950 transition-colors">
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
