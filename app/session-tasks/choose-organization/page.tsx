import { TaskChooseOrganization } from "@clerk/nextjs";
import { DASHBOARD_PATH } from "@/lib/auth-routes";

export default function ChooseOrganizationPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <TaskChooseOrganization redirectUrlComplete={DASHBOARD_PATH} />
    </div>
  );
}
