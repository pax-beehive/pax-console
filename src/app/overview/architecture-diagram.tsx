import {
  Cloud,
  Laptop,
  LockKeyhole,
  Server,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import type { overviewContent } from "./content";

export function ArchitectureDiagram({
  copy,
}: {
  copy: (typeof overviewContent)["en"]["diagram"];
}) {
  return (
    <figure
      className="overflow-hidden rounded-xl border border-hairline-strong bg-surface-1"
      aria-labelledby="architecture-caption"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4 text-xs text-ink-subtle">
        <span>{copy.heading}</span>
        <span>{copy.kind}</span>
      </div>
      <svg
        viewBox="0 0 520 380"
        role="img"
        aria-labelledby="architecture-title architecture-description"
        className="block h-auto w-full"
      >
        <title id="architecture-title">{copy.title}</title>
        <desc id="architecture-description">{copy.description}</desc>

        <g fill="none" stroke="var(--success)" strokeWidth="1.5" opacity="0.65">
          <path d="M121 184H208" />
          <path d="M296 184H326Q336 184 336 174V88Q336 78 346 78H396" />
          <path d="M296 184H396" />
          <path d="M296 184H326Q336 184 336 194V280Q336 290 346 290H396" />
        </g>
        <g fill="var(--success)">
          <circle cx="146" cy="184" r="3" />
          <circle cx="366" cy="78" r="3" />
          <circle cx="366" cy="184" r="3" />
          <circle cx="366" cy="290" r="3" />
        </g>

        <g className="text-ink-muted" strokeWidth="1.4">
          <UserRound x="61" y="114" width="30" height="30" />
          <Laptop x="46" y="154" width="62" height="52" />
          <Cloud x="210" y="148" width="84" height="66" />
        </g>
        <g fill="var(--ink)" fontSize="18" textAnchor="middle">
          <text x="77" y="236">
            {copy.computer}
          </text>
          <text x="252" y="236">
            {copy.cloud}
          </text>
        </g>
        <g fill="var(--ink-subtle)" fontSize="14" textAnchor="middle">
          <text x="77" y="260">
            {copy.browser}
          </text>
          <text x="252" y="260">
            {copy.relay}
          </text>
        </g>

        {copy.hosts.map((label, index) => (
          <g key={label}>
            <Server
              x="410"
              y={78 + index * 106 - 24}
              width="42"
              height="42"
              className="text-ink-muted"
              strokeWidth="1.4"
            />
            <LockKeyhole
              x="392"
              y={78 + index * 106 - 29}
              width="15"
              height="15"
              className="text-success"
            />
            <text
              x="431"
              y={78 + index * 106 + 43}
              fill="var(--ink)"
              fontSize="17"
              textAnchor="middle"
            >
              {label}
            </text>
            <text
              x="431"
              y={78 + index * 106 + 64}
              fill="var(--ink-subtle)"
              fontSize="14"
              textAnchor="middle"
            >
              {copy.agent}
            </text>
          </g>
        ))}
        <LockKeyhole
          x="112"
          y="155"
          width="15"
          height="15"
          className="text-success"
        />
      </svg>
      <figcaption
        id="architecture-caption"
        className="mx-5 border-t border-hairline py-5"
      >
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
          {copy.encryption}
        </p>
        <p className="mt-2 text-xs leading-6 text-ink-subtle">{copy.caption}</p>
      </figcaption>
    </figure>
  );
}
