import { company, pages } from "./content.mjs";

const origin = "https://paxworkspace.net";
const css = `
:root{color-scheme:dark;--bg:#101114;--text:#eeeff3;--muted:#b4b7c3;--line:#2d2f38;--link:#aab2ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--link);text-underline-offset:4px}a:hover{color:#fff}a:focus-visible{outline:2px solid var(--link);outline-offset:5px}header,footer{max-width:1100px;margin:auto;padding:24px 32px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}header{border-bottom:1px solid var(--line)}.brand{font-size:19px;font-weight:650;letter-spacing:-.5px;color:var(--text);text-decoration:none}nav{display:flex;gap:20px;flex-wrap:wrap;font-size:14px}nav a[aria-current=page]{color:white}main{max-width:800px;margin:0 auto;padding:64px 32px 80px}h1{font-size:clamp(34px,6vw,52px);line-height:1.2;letter-spacing:-1.6px;font-weight:600;margin:16px 0 28px}h2{font-size:22px;line-height:1.4;font-weight:550;margin:0 0 16px;letter-spacing:-.4px}p,li{color:var(--muted)}p{margin:14px 0}strong{color:var(--text);font-weight:550}.eyebrow{font:12px/1.5 ui-monospace,monospace;letter-spacing:1.5px}.lead{font-size:20px;line-height:1.7;color:#d4d6df}section{margin-top:40px;padding-top:32px;border-top:1px solid var(--line)}ul{padding-left:22px}li{padding-left:4px;margin:16px 0}footer{font-size:13px;border-top:1px solid var(--line);color:var(--muted)}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:24px;margin:28px 0}.button{border:1px solid #606ba6;border-radius:8px;padding:10px 18px;color:var(--text);text-decoration:none;background:#202338}.skip{position:absolute;left:12px;top:-100px;background:var(--bg);padding:8px}.skip:focus{top:8px}main a{overflow-wrap:anywhere}@media(max-width:520px){header,footer{padding:20px 24px}main{padding:40px 24px 56px}nav{gap:16px}h1{letter-spacing:-1px}}@media print{body{background:white;color:#111}p,li,.lead{color:#222}header,footer,.actions,.skip{display:none}main{max-width:none;padding:0}a{color:#111}section{break-inside:avoid}}
`;

export function renderPage(path) {
  const page = pages[path];
  const link = (href, label) =>
    `<a href="${href}"${path === href ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title} | PAX Workspace</title><meta name="description" content="${page.description}"><link rel="canonical" href="${origin}${path}"><meta name="robots" content="index,follow"><style>${css}</style></head><body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/about">PAX Workspace</a><nav aria-label="Public pages">${link("/about", "About")}${link("/privacy", "Privacy")}${link("/terms", "Terms")}<a href="/">Workspace ↗</a></nav></header><main id="main"><p class="eyebrow">${page.eyebrow}</p><h1>${page.title}</h1>${page.body}</main><footer><span>© 2026 ${company.name}</span><nav aria-label="Legal and contact">${link("/privacy", "Privacy Policy")}${link("/terms", "Terms of Service")}<a href="mailto:${company.email}">Contact</a></nav></footer></body></html>`;
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    // The deployment routes are prefix patterns. Never proxy or expose siblings.
    if (url.hostname !== "paxworkspace.net" || !Object.hasOwn(pages, path)) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    if (url.pathname !== path || url.protocol !== "https:") {
      return Response.redirect(`${origin}${path}${url.search}`, 308);
    }
    return new Response(request.method === "HEAD" ? null : renderPage(path), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-Pax-Public-Pages": "2026-10-12",
      },
    });
  },
};
