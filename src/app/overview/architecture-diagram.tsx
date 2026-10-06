import {
  Cloud,
  Laptop,
  LockKeyhole,
  Server,
  ShieldCheck,
  UserRound,
} from "lucide-react";

export function ArchitectureDiagram() {
  return (
    <figure
      className="overflow-hidden rounded-xl border border-hairline-strong bg-surface-1"
      aria-labelledby="architecture-caption"
    >
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4 text-xs text-ink-subtle">
        <span>一个入口，连接你的设备</span>
        <span>连接示意</span>
      </div>
      <svg
        viewBox="0 0 520 380"
        role="img"
        aria-labelledby="architecture-title architecture-description"
        className="block h-auto w-full"
      >
        <title id="architecture-title">
          你的电脑通过 PAX 云连接多台运行 Agent 的服务器
        </title>
        <desc id="architecture-description">
          左侧是你的电脑，中间是负责连接与转发的 PAX 云，右侧是三台运行 Agent
          的设备。支持可选端到端加密，开启后在浏览器和设备两端加解密，云端转发会话密文。
        </desc>

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
            你的电脑
          </text>
          <text x="252" y="236">
            PAX 云
          </text>
        </g>
        <g fill="var(--ink-subtle)" fontSize="14" textAnchor="middle">
          <text x="77" y="260">
            浏览器工作台
          </text>
          <text x="252" y="260">
            连接与转发
          </text>
        </g>

        {[
          { y: 78, label: "服务器 A" },
          { y: 184, label: "服务器 B" },
          { y: 290, label: "工作电脑" },
        ].map(({ y, label }) => (
          <g key={label}>
            <Server
              x="410"
              y={y - 24}
              width="42"
              height="42"
              className="text-ink-muted"
              strokeWidth="1.4"
            />
            <LockKeyhole
              x="392"
              y={y - 29}
              width="15"
              height="15"
              className="text-success"
            />
            <text
              x="431"
              y={y + 43}
              fill="var(--ink)"
              fontSize="17"
              textAnchor="middle"
            >
              {label}
            </text>
            <text
              x="431"
              y={y + 64}
              fill="var(--ink-subtle)"
              fontSize="14"
              textAnchor="middle"
            >
              运行 Agent
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
          支持端到端加密 · E2EE
        </p>
        <p className="mt-2 text-xs leading-6 text-ink-subtle">
          开启后，会话内容在你的浏览器与运行 Agent 的设备之间加密传输，PAX
          云转发密文。
        </p>
      </figcaption>
    </figure>
  );
}
