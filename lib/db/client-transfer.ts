import { requireAdminMember } from "./auth";
import { runInTenantTransaction } from "./rls-session";
import { lockClientIdentities } from "./client-identity";
import { clientIdentityKey } from "../clients/identity";
import { clientInputSchema, type ClientInput } from "../validation/clients";
import { CLIENT_ROW_LIMIT, ClientFileError } from "../clients/files";

export async function importClients(inputs: ClientInput[], commit: boolean) {
  const user = await requireAdminMember();
  if (!inputs.length || inputs.length > CLIENT_ROW_LIMIT)
    throw new ClientFileError("Import vide ou trop volumineux.");
  const validated = inputs.map((input) => clientInputSchema.parse(input));
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      await lockClientIdentities(tx, user.tenantId);
      const referrerIds = Array.from(
        new Set(
          validated.flatMap((row) => (row.referredByClientId ? [row.referredByClientId] : [])),
        ),
      );
      if (
        referrerIds.length &&
        (await tx.client.count({ where: { tenantId: user.tenantId, id: { in: referrerIds } } })) !==
          referrerIds.length
      )
        throw new ClientFileError(
          "Un identifiant de client qui recommande est inconnu dans ce salon. Utilisez son nom à la place si la fiche n’existe pas.",
        );
      const existing = await tx.client.findMany({
        where: { tenantId: user.tenantId },
        select: { name: true, phone: true, email: true, sex: true },
      });
      const keys = new Set(existing.map(clientIdentityKey));
      const additions: ClientInput[] = [];
      for (const input of validated) {
        const key = clientIdentityKey(input);
        if (!keys.has(key)) {
          additions.push(input);
          keys.add(key);
        }
      }
      if (commit && additions.length)
        await tx.client.createMany({
          data: additions.map((input) => ({
            ...input,
            phone: input.phone || null,
            email: input.email || null,
            tenantId: user.tenantId,
          })),
        });
      return {
        added: additions.length,
        skipped: inputs.length - additions.length,
        total: inputs.length,
      };
    },
  );
}

export async function exportClients(status: "active" | "archived" | "all") {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    (tx) =>
      tx.client.findMany({
        where: {
          tenantId: user.tenantId,
          ...(status === "all" ? {} : { isDeleted: status === "archived" }),
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          name: true,
          phone: true,
          email: true,
          sex: true,
          preferences: true,
          allergies: true,
          notes: true,
          city: true,
          neighbourhood: true,
          addressDetails: true,
          discoverySource: true,
          discoveryDetails: true,
          referredByClientId: true,
          referrerName: true,
        },
      }),
  );
}
