import { OperatorConsole } from "@/components/portal";
import { miniAppPortalLink } from "@/lib/links";

export const dynamic = "force-dynamic";
export default function AdminPage() {
  return (
    <div className="content-wrap">
      <OperatorConsole openLink={miniAppPortalLink("admin")} />
    </div>
  );
}
