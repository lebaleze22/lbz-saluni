import type { Prisma } from "@prisma/client";
import { clientIdentityKey, type ClientIdentity } from "../clients/identity";

// Serialize client identity checks and writes within a salon. The transaction lock
// also covers concurrent register submissions and profile edits.
export async function lockClientIdentities(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`clients:${tenantId}`}, 0))`;
}

export async function matchingClients(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: ClientIdentity,
  excludeId?: string,
) {
  const name = input.name.trim().replace(/\s+/g, " ").toLowerCase();
  const candidates = await tx.$queryRaw<
    Array<ClientIdentity & { id: string; active: boolean; isDeleted: boolean }>
  >`SELECT id, name, phone, email, sex, active, is_deleted AS "isDeleted"
    FROM clients WHERE tenant_id = ${tenantId}::uuid
    AND lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) = ${name}`;
  const key = clientIdentityKey(input);
  return candidates.filter(
    (client) => client.id !== excludeId && clientIdentityKey(client) === key,
  );
}
