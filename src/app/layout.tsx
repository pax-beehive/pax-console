import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PAX Console",
  description: "Fleet control plane and agent workbench for PAX.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [{ url: "/pax-app-icon.png", type: "image/png" }],
    icon: [{ url: "/pax-app-icon.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
