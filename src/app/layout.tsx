import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import {
  publicRuntimeConfigFromEnv,
  serializePublicRuntimeConfig,
} from "@/features/runtime/public-runtime-config";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const runtimeConfig = publicRuntimeConfigFromEnv(process.env);
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <script
          id="pax-runtime-config"
          dangerouslySetInnerHTML={{
            __html: serializePublicRuntimeConfig(runtimeConfig),
          }}
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
