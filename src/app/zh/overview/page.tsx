import { OverviewPage } from "@/app/overview/overview-page";
import { overviewMetadata } from "@/app/overview/metadata";

export const metadata = overviewMetadata("zh");

export default function Page() {
  return <OverviewPage locale="zh" />;
}
