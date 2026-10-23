import Link from "next/link";
import { ArrowUpRight, Laptop, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaxLogo } from "@/components/ui/pax-logo";
import { ArchitectureDiagram } from "./architecture-diagram";

import { overviewContent, overviewPaths, type OverviewLocale } from "./content";

export function OverviewPage({ locale }: { locale: OverviewLocale }) {
  const copy = overviewContent[locale];
  const { title, description, features, questions } = copy;
  const language = locale === "zh" ? "zh-CN" : "en";
  const url = `https://paxworkspace.net${overviewPaths[locale]}`;
  return (
    <div lang={language} className="min-h-screen bg-canvas text-ink">
      <Link
        prefetch={false}
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-canvas focus:p-4"
      >
        {copy.skip}
      </Link>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-hairline px-6 py-5 sm:px-10">
        <Link
          prefetch={false}
          href={overviewPaths[locale]}
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
          aria-label={copy.homeLabel}
        >
          <PaxLogo className="h-9 w-9" />
          PaxWorkspace
        </Link>
        <nav
          aria-label={copy.languageLabel}
          className="ml-auto flex items-center gap-3 text-sm"
        >
          <Link
            prefetch={false}
            href="/overview"
            hrefLang="en"
            lang="en"
            aria-current={locale === "en" ? "page" : undefined}
            className="text-ink-subtle hover:text-ink aria-[current=page]:text-ink"
          >
            English
          </Link>
          <span aria-hidden="true" className="text-ink-tertiary">
            /
          </span>
          <Link
            prefetch={false}
            href="/zh/overview"
            hrefLang="zh-CN"
            lang="zh-CN"
            aria-current={locale === "zh" ? "page" : undefined}
            className="text-ink-subtle hover:text-ink aria-[current=page]:text-ink"
          >
            中文
          </Link>
        </nav>
        <Button asChild variant="secondary">
          <Link prefetch={false} href="/">
            {copy.open} <ArrowUpRight className="h-4 w-4" />
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
              {copy.headline}
              <br />
              <span className="text-ink-subtle">{copy.headlineEnd}</span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-8 text-ink-muted">
              {copy.intro}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Button asChild variant="primary" className="min-h-11 px-5">
                <Link prefetch={false} href="/">
                  {copy.start} <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Link
                prefetch={false}
                href="#how-it-works"
                className="text-sm text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
              >
                {copy.learn}
              </Link>
            </div>
            {locale === "zh" && (
              <p className="mt-3 text-xs text-ink-subtle">
                {copy.workbenchNote}
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-ink-subtle">
              <span className="inline-flex items-center gap-2">
                <Laptop className="h-4 w-4" />
                {copy.desktop}
              </span>
              <span className="inline-flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                {copy.mobile}
              </span>
              <span>{copy.ownership}</span>
            </div>
          </div>

          <ArchitectureDiagram copy={copy.diagram} />
        </section>

        <section
          className="border-t border-hairline py-14"
          aria-labelledby="features-heading"
        >
          <h2
            id="features-heading"
            className="text-2xl font-medium tracking-tight"
          >
            {copy.featuresHeading}
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
            {copy.startHeading}
          </h2>
          <ol className="grid gap-6 text-sm">
            {copy.steps.map((step, index) => (
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
            {copy.faqHeading}
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
          {copy.open}
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
            inLanguage: language,
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
