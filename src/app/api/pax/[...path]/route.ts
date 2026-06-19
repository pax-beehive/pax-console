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

  // In production, Cloudflare Access passes the verified user JWT to the
  // origin as a header. Local or tunnel-based development can still use a
  // CF_Authorization cookie, with PAX_CF_AUTHORIZATION as a server-side escape
  // hatch for cases where the browser cannot send that cookie to this origin.
  const accessJwt = request.headers.get("Cf-Access-Jwt-Assertion");
  const cfAuthorization =
    process.env.PAX_CF_AUTHORIZATION ??
    request.cookies.get("CF_Authorization")?.value;

  if (!accessJwt && !cfAuthorization) {
    return NextResponse.json(
      {
        code: 401,
        data: {},
        message:
          "Missing Cloudflare Access identity. Expected Cf-Access-Jwt-Assertion from Cloudflare Access or CF_Authorization/PAX_CF_AUTHORIZATION for local development.",
      },
      { status: 401 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("accept-encoding", "identity");
  // Preserve the user Access identity for pax-manager. The JWT header is the
  // production path; the cookie path keeps local development working.
  if (accessJwt) {
    headers.set("Cf-Access-Jwt-Assertion", accessJwt);
  }
  if (cfAuthorization) {
    headers.set("cookie", `CF_Authorization=${cfAuthorization}`);
  }

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
