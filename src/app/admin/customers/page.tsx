import { CustomerAnalyticsPage } from "@/components/analytics/customer-analytics-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string | string[] }>;
}) {
  const { customer } = await searchParams;
  return (
    <CustomerAnalyticsPage
      initialSearch={typeof customer === "string" ? customer : ""}
    />
  );
}
