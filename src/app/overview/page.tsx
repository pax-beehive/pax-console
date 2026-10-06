import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Laptop, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaxLogo } from "@/components/ui/pax-logo";
import { ArchitectureDiagram } from "./architecture-diagram";

const title = "PaxWorkspace — 不同 AI Agent，同一个工作台";
const description =
  "PaxWorkspace（PAX）是面向多种 AI 编程 Agent 的统一工作台。在电脑和手机上连接自己的设备，管理项目与会话，查看工作进展、处理授权、审阅产物，让你自由选择适合任务的 Agent。";
const url = "https://paxworkspace.net/overview";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url,
    title,
    description,
    siteName: "PaxWorkspace",
    locale: "zh_CN",
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

const features = [
  {
    number: "01",
    title: "Agent 由你选",
    body: "把不同的编程 Agent 接入同一个工作台，按项目和任务选择。会话、进度和产物有统一的入口。",
  },
  {
    number: "02",
    title: "工作留在你的设备上",
    body: "连接自己的电脑或服务器，让 Agent 在对应设备的项目目录里工作。在工作台里管理设备、项目和会话。",
  },
  {
    number: "03",
    title: "离开电脑，也能接着看",
    body: "用手机打开同一个工作台，查看会话进展、发送下一条指令、处理待授权操作，查看 Agent 交付的文件。",
  },
];

const questions = [
  {
    question: "PaxWorkspace 是什么？",
    answer:
      "PaxWorkspace，也叫 PAX，是一个 AI Agent 工作台。它把设备、项目和 Agent 会话集中在一起，让你从浏览器使用接入的编程 Agent。",
  },
  {
    question: "可以使用哪些 Agent？",
    answer:
      "PAX 通过 ACP（Agent Client Protocol）及相应适配器接入编程 Agent。具体可用的 Agent、模型和能力，取决于你在设备上安装的运行时、适配器和账号配置；以工作台中的可用列表为准。",
  },
  {
    question: "手机上可以用吗？",
    answer:
      "可以。电脑和手机都通过浏览器打开工作台。连接设备后，就能查看会话、跟进任务，并在对应会话中继续发消息。",
  },
  {
    question: "支持端到端加密吗？",
    answer:
      "支持。配对浏览器与设备后，可以为会话开启 E2EE。会话内容在浏览器和运行 Agent 的设备两端加解密，PAX 云负责转发密文。加密范围是浏览器到设备这一段；Agent 调用模型服务时，仍使用对应服务的连接。",
  },
  {
    question: "怎么开始？",
    answer:
      "打开工作台并登录，按设备接入引导连接自己的电脑或服务器，再选择项目和已配置的 Agent，开始第一段会话。",
  },
];

export default function OverviewPage() {
  return (
    <div lang="zh-CN" className="min-h-screen bg-canvas text-ink">
      <Link
        prefetch={false}
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-canvas focus:p-4"
      >
        跳到正文
      </Link>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 border-b border-hairline px-6 py-5 sm:px-10">
        <Link
          prefetch={false}
          href="/overview"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
          aria-label="PaxWorkspace 产品介绍"
        >
          <PaxLogo className="h-9 w-9" />
          PaxWorkspace
        </Link>
        <Button asChild variant="secondary">
          <Link prefetch={false} href="/">
            打开工作台 <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-6 sm:px-10">
        <section
          className="grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-24"
          aria-labelledby="overview-heading"
        >
          <div>
            <p className="mb-6 font-mono text-xs tracking-[0.16em] text-ink-subtle">
              PAXWORKSPACE / AI AGENT WORKSPACE
            </p>
            <h1
              id="overview-heading"
              className="text-4xl font-semibold leading-[1.25] tracking-tight sm:text-5xl"
            >
              不同 Agent，
              <br />
              <span className="text-ink-subtle">同一个工作台。</span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-8 text-ink-muted">
              PaxWorkspace 把你接入的 AI 编程 Agent
              放在同一个工作台里。从电脑到手机，围绕你的项目，选择
              Agent、跟进会话、审阅产物。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Button asChild variant="primary" className="min-h-11 px-5">
                <Link prefetch={false} href="/">
                  开始使用 <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Link
                prefetch={false}
                href="#how-it-works"
                className="text-sm text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
              >
                了解如何开始
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-4 text-xs text-ink-subtle">
              <span className="inline-flex items-center gap-2">
                <Laptop className="h-4 w-4" />
                电脑
              </span>
              <span className="inline-flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                手机
              </span>
              <span>你的设备 · 你的项目</span>
            </div>
          </div>

          <ArchitectureDiagram />
        </section>

        <section
          className="border-t border-hairline py-14"
          aria-labelledby="features-heading"
        >
          <h2
            id="features-heading"
            className="text-2xl font-medium tracking-tight"
          >
            选谁来做，由你决定。
          </h2>
          <div className="mt-10 grid gap-9 md:grid-cols-3 md:gap-10">
            {features.map((feature) => (
              <article key={feature.number}>
                <p className="font-mono text-xs text-ink-tertiary">
                  {feature.number}
                </p>
                <h3 className="mt-4 text-lg font-medium">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-subtle">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="grid gap-8 border-t border-hairline py-14 md:grid-cols-[1fr_2fr]"
          aria-labelledby="start-heading"
        >
          <h2
            id="start-heading"
            className="text-2xl font-medium tracking-tight"
          >
            从自己的项目开始。
          </h2>
          <ol className="grid gap-6 text-sm">
            {[
              "登录工作台，按引导连接电脑或服务器。",
              "选择项目目录和已配置的 Agent。",
              "开始会话，随时查看进度、处理授权、审阅产物。",
            ].map((step, index) => (
              <li
                key={step}
                className="flex items-start gap-4 leading-7 text-ink-muted"
              >
                <span className="font-mono text-ink-tertiary">
                  0{index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section
          className="grid gap-8 border-t border-hairline py-14 md:grid-cols-[1fr_2fr]"
          aria-labelledby="faq-heading"
        >
          <h2 id="faq-heading" className="text-2xl font-medium tracking-tight">
            常见问题
          </h2>
          <div className="divide-y divide-hairline">
            {questions.map(({ question, answer }) => (
              <details key={question} className="group py-5 first:pt-0">
                <summary className="cursor-pointer text-base font-medium marker:text-ink-subtle">
                  {question}
                </summary>
                <p className="mt-4 text-sm leading-7 text-ink-subtle">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 border-t border-hairline px-6 py-8 text-xs text-ink-subtle sm:px-10">
        <span>PaxWorkspace · PAX</span>
        <Link
          prefetch={false}
          href="/"
          className="inline-flex items-center gap-2 hover:text-ink"
        >
          打开工作台
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </footer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": url,
            url,
            name: title,
            description,
            inLanguage: "zh-CN",
            about: {
              "@type": "SoftwareApplication",
              name: "PaxWorkspace",
              alternateName: "PAX",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Web",
              url,
              description,
            },
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
