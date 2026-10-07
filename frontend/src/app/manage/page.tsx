import { ProviderWorkspace } from "@/components/portal";
import { miniAppPortalLink } from "@/lib/links";

export const dynamic = "force-dynamic";
export default function ManagePage() {
  return (
    <div className="content-wrap">
      <ProviderWorkspace openLink={miniAppPortalLink("manage")} />
    </div>
  );
}
