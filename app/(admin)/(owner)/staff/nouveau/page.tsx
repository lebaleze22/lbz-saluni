import { requireOwner } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";
import { NewStaffForm } from "./new-staff-form";
export const dynamic = "force-dynamic";
export default async function NewStaffPage() {
  const owner = await requireOwner();
  const titles = await runInTenantTransaction(
    { userId: owner.id, tenantId: owner.tenantId, role: owner.role },
    (tx) =>
      tx.jobTitle.findMany({
        where: { tenantId: owner.tenantId, active: true, isDeleted: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
  );
  return <NewStaffForm titles={titles} />;
}
