import type { Metadata } from "next";
import { overviewContent, overviewPaths, type OverviewLocale } from "./content";

export function overviewMetadata(locale: OverviewLocale): Metadata {
  const { title, description } = overviewContent[locale];
  const url = `https://paxworkspace.net${overviewPaths[locale]}`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: "https://paxworkspace.net/overview",
        "zh-CN": "https://paxworkspace.net/zh/overview",
        "x-default": "https://paxworkspace.net/overview",
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "PaxWorkspace",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      alternateLocale: locale === "zh" ? "en_US" : "zh_CN",
      images: [
        {
          url: "https://paxworkspace.net/paxworkspace-social.png",
          width: 1200,
          height: 630,
          alt: "PaxWorkspace — Different agents. One workspace.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["https://paxworkspace.net/paxworkspace-social.png"],
    },
  };
}
