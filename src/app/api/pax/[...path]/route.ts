import { NextRequest, NextResponse } from "next/server";

const PAX_MANAGER_URL = process.env.PAX_MANAGER_URL ?? "https://app.paxtech.net";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyPaxRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyPaxRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyPaxRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyPaxRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyPaxRequest(request, context);
}

async function proxyPaxRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const targetUrl = new URL(`/${path.join("/")}`, PAX_MANAGER_URL);
  targetUrl.search = request.nextUrl.search;

  // Local dev runs the browser at console.paxtech.net but keeps backend calls
  // same-origin through this route. Cloudflare's Access cookie is HttpOnly, so
  // the browser cannot manually pass it to app.paxtech.net; the server proxy can
  // read the incoming cookie and forward it on the upstream request.
  const cfAuthorization =
    process.env.PAX_CF_AUTHORIZATION ??
    request.cookies.get("CF_Authorization")?.value;

  if (!cfAuthorization) {
    return NextResponse.json(
      {
        code: 401,
        data: {},
        message:
          "Missing PAX_CF_AUTHORIZATION for local dev proxy. Set it in .env.local or run the app on the Cloudflare-protected domain.",
      },
      { status: 401 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  // Preserve the user Access session for pax-manager. In CI or token-based
  // local testing, PAX_CF_AUTHORIZATION can override the browser cookie.
  headers.set("cookie", `CF_Authorization=${cfAuthorization}`);

  const response = await fetch(targetUrl, {
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    headers,
    method: request.method,
    redirect: "manual",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}
