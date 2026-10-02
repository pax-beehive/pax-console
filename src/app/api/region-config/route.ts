export const dynamic = "force-dynamic";
export async function GET() {
  const enabled = process.env.PAX_BROWSER_REGIONS_ENABLED === "true";
  if (!enabled)
    return Response.json(
      { enabled: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  const origin = process.env.PAX_REGION_PUBLIC_ORIGIN;
  try {
    if (
      !origin ||
      new URL(origin).protocol !== "https:" ||
      new URL(origin).origin !== origin
    )
      throw new Error("Invalid origin");
    return Response.json(
      { enabled: true, origin },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "region_configuration_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
