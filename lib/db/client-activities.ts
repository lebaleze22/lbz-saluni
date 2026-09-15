import { requireAdminMember } from "./auth";
import { runInTenantTransaction } from "./rls-session";
import { ClientDataError } from "./clients";
import { clientActivitySchema } from "../validation/client-activity";
export async function addClientActivity(input: unknown) {
  const user = await requireAdminMember();
  const parsed = clientActivitySchema.parse(input);
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: parsed.clientId, tenantId: user.tenantId, active: true, isDeleted: false },
      });
      if (!client) throw new ClientDataError("Ce client est introuvable ou archivé.");
      return tx.clientActivity.create({
        data: { ...parsed, tenantId: user.tenantId, recordedBy: user.id },
      });
    },
  );
}
