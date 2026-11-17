import { NextRequest, NextResponse } from "next/server";

import {
  ModelCatalogError,
  readAdminModelCatalog,
} from "@/lib/server/model-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  if (
    query.getAll("provider").length !== 1 ||
    query.get("provider") !== "openrouter" ||
    [...query.keys()].some((key) => key !== "provider")
  ) {
    return NextResponse.json(
      { error: { code: "invalid_model_catalog_provider" } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    // Check the current user's role before every response, including cache hits.
    return NextResponse.json(await readAdminModelCatalog(request), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof ModelCatalogError ? error.status : 503;
    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "authentication_required"
              : status === 403
                ? "administrator_access_required"
                : "model_catalog_unavailable",
        },
      },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
