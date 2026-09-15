export type ClientIdentity = {
  name: string;
  phone?: string | null;
  email?: string | null;
  sex?: string | null;
};

export function normalizeClientPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^00/, "");
  // The salon's national numbers are Cameroon numbers. Preserve other country codes.
  return /^[26]\d{8}$/.test(digits) ? `237${digits}` : digits;
}

export function clientIdentityKey(client: ClientIdentity) {
  return JSON.stringify([
    client.name.trim().replace(/\s+/g, " ").toLowerCase(),
    normalizeClientPhone(client.phone),
    (client.email ?? "").trim().toLowerCase(),
    client.sex || "",
  ]);
}
