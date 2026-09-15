import dotenv from "dotenv";
import { createServerClient } from "@supabase/ssr";

dotenv.config({ path: ".env.local" });

const base = process.env.LOCAL_PUBLIC_URL ?? "http://localhost:54321";
const email = process.env.SEED_DEV_OWNER_EMAIL ?? "owner.dev@caprice-ebene.com";
const password = process.env.SEED_DEV_OWNER_PASSWORD ?? "CapriceOwner2026!";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");

const jar = new Map();
const auth = createServerClient(base, anonKey, {
  cookieOptions: { name: "saluni-auth" },
  cookies: {
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const login = await auth.auth.signInWithPassword({ email, password });
if (login.error) throw login.error;
const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");

const rootResponse = await fetch(`${base}/`, {
  headers: { cookie },
  redirect: "follow",
  signal: AbortSignal.timeout(15000),
});
const rootHtml = await rootResponse.text();
if (
  rootResponse.status !== 200 ||
  rootHtml.includes("502 Bad Gateway") ||
  rootHtml.includes('id="__next_error__"')
) {
  throw new Error(`Authenticated root navigation failed (${rootResponse.status}).`);
}
console.log("LIVE OWNER PASS / -> /register");

for (const [route, expectedTexts] of [
  ["/register", ["Visite réalisée", "Rendez-vous à venir", "Encaissements du jour"]],
  ["/sales", ["Nouvelle vente"]],
  ["/appointments", ["Planifier un rendez-vous"]],
  [
    "/reports?period=week&date=2026-09-13",
    ["Résultats des rendez-vous", "Planifiés", "Confirmés", "Encaissements", "Solde restant"],
  ],
  ["/inventory", ["Importer le stock depuis CSV ou Excel"]],
]) {
  const response = await fetch(`${base}${route}`, {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();
  const missingTexts = expectedTexts.filter((expected) => !html.includes(expected));
  if (
    response.status !== 200 ||
    missingTexts.length > 0 ||
    html.includes('id="__next_error__"')
  ) {
    throw new Error(
      `${route} failed the deployed owner check (${response.status}); missing: ${missingTexts.join(", ")}.`,
    );
  }
  console.log(`LIVE OWNER PASS ${route}`);
}

for (const [format, contentType] of [
  ["pdf", "application/pdf"],
  ["excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]) {
  const response = await fetch(
    `${base}/reports/export/${format}?period=week&date=2026-09-13`,
    {
      headers: { cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    },
  );
  const body = await response.arrayBuffer();
  if (
    response.status !== 200 ||
    !response.headers.get("content-type")?.includes(contentType) ||
    body.byteLength < 500
  ) {
    throw new Error(`Report ${format} export failed the deployed owner check.`);
  }
  console.log(`LIVE OWNER PASS /reports/export/${format}`);
}

for (const format of ["csv", "xlsx"]) {
  const response = await fetch(`${base}/inventory/template?format=${format}`, {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  if (
    response.status !== 200 ||
    !response.headers.get("content-disposition")?.includes(`.${format}`)
  )
    throw new Error(`Inventory ${format} template failed the deployed owner check.`);
  console.log(`LIVE OWNER PASS /inventory/template (${format})`);
}
