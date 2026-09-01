// Import ponctuel du catalogue réel de prestations de Caprice D'Ebène — voir
// docs/Catalogue_Prestations_Caprice_Ebene.md (source) et
// docs/architecture/016-catalogue-prestations-caprice.md (décision).
//
// Séparé de scripts/seed-dev.mjs à dessein : ce dernier reste "identité uniquement"
// (tenant + compte Director de démo), son contrat n'est pas modifié par ce script.
//
// Idempotent : rejouable sans dupliquer. Chaque catégorie est identifiée par
// (tenant_id, name), chaque prestation par (tenant_id, category_id, name) — une
// prestation de même nom dans deux catégories différentes (ex. "Nattes simples" en
// Barber/Tresses/Enfant, "Curly" en Barber/Beauty) reste donc deux lignes distinctes,
// par décision explicite (pas de déduplication par nom seul). Les massages sont
// listés comme deux prestations séparées par durée ("Massage dorsal 30 min"/"60 min"),
// pas de champ durée-prix supplémentaire.
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const TENANT_NAME = process.env.CLIENT_TENANT_NAME?.trim() || "Caprice D'Ebène";
const JOB_TITLES = [
  "Barbier / Barbière",
  "Coiffeur / Coiffeuse",
  "Esthéticien / Esthéticienne",
  "Masseur / Masseuse",
  "Prothésiste ongulaire",
];

// L'instance locale volontairement minimale n'embarque pas PostgREST. Comme les
// autres scripts d'administration, cet import utilise donc la connexion Prisma
// privilégiée et n'emploie Supabase que là où Auth est réellement nécessaire.
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DIRECT_URL;

if (!adminDatabaseUrl) {
  throw new Error("ADMIN_DATABASE_URL ou DIRECT_URL doit être renseigné dans .env.local ou .env.");
}

const prisma = new PrismaClient({ datasourceUrl: adminDatabaseUrl });

// Transcription littérale de docs/Catalogue_Prestations_Caprice_Ebene.md — 11
// catégories, 81 lignes de prestations (les 5 "Massages" comptent double : une ligne
// par durée, cf. décision ci-dessus).
const CATALOGUE = [
  {
    category: "Barber",
    services: [
      { name: "Traçage", price: 1000 },
      { name: "Coupe simple", price: 2000 },
      { name: "Nattes simples", price: 1500 },
      { name: "Twist", price: 5000 },
      { name: "Dreadlocks", price: 25000 },
      { name: "Traitement dread", price: 15000 },
      { name: "Curly", price: 4000 },
      { name: "Coupe plus traitement", price: 7000 },
      { name: "Coupe plus soins barbe", price: 10000 },
      { name: "Coupe plus coloration", price: 5000 },
    ],
  },
  {
    category: "Massages",
    services: [
      { name: "Massage dorsal 30 min", price: 5000 },
      { name: "Massage dorsal 60 min", price: 8000 },
      { name: "Massage relaxant 30 min", price: 10000 },
      { name: "Massage relaxant 60 min", price: 20000 },
      { name: "Massage sportif 30 min", price: 20000 },
      { name: "Massage sportif 60 min", price: 35000 },
      { name: "Massage thaïlandais 30 min", price: 15000 },
      { name: "Massage thaïlandais 60 min", price: 25000 },
      { name: "Massage thérapeutique 30 min", price: 10000 },
      { name: "Massage thérapeutique 60 min", price: 18000 },
    ],
  },
  {
    category: "Faciale",
    services: [
      { name: "Coup d'éclat", price: 5000 },
      { name: "Soin classique", price: 8000 },
      { name: "Soin hydratant", price: 10000 },
      { name: "Soin aux céréales", price: 10000 },
      { name: "Soin anti-acné", price: 15000 },
      { name: "Soin luminothérapie", price: 15000 },
      { name: "Soin haute fréquence", price: 15000 },
      { name: "Soin anti-âge", price: 20000 },
    ],
  },
  {
    category: "Soins corporel",
    services: [
      { name: "Hammam", price: 5000 },
      { name: "Hammam gommage hydratant", price: 15000 },
      { name: "Hammam gommage éclaircissant", price: 18000 },
      { name: "Hammam gommage modelage enveloppement", price: 20000 },
    ],
  },
  {
    category: "Onglerie",
    services: [
      { name: "Manucure sèche", price: 3000 },
      { name: "Manucure trempée", price: 5000 },
      { name: "Gants hydratants", price: 2500 },
      { name: "Vernis gel", price: 3000 },
      { name: "Manucure sèche + vernis gel sur capsule", price: 7000 },
      { name: "Gainage", price: 10000 },
      { name: "Construction sur capsule", price: 12000 },
      { name: "Construction sur chablon", price: 15000 },
      { name: "Baby boomer", price: 15000 },
      { name: "Construction 3D", price: 25000 },
      { name: "Décoration (AP)", price: 2000 },
      { name: "Dépose", price: 2000 },
    ],
  },
  {
    category: "Pédicure",
    services: [
      { name: "Pédicure sèche", price: 4000 },
      { name: "Pédicure spa", price: 10000 },
      { name: "Pédicure traitante", price: 15000 },
      { name: "Chaussettes traitantes", price: 2500 },
    ],
  },
  {
    category: "Soins de cheveux",
    services: [
      { name: "Shampooing", price: 2000 },
      { name: "Traitement de cheveux", price: 10000 },
      { name: "Coloration noir (AP)", price: 5000 },
      { name: "Coloration couleur (AP)", price: 7000 },
      { name: "Défrisage (AP)", price: 5000 },
      { name: "Traitement de perruque (AP)", price: 7000 },
    ],
  },
  {
    category: "Tresses",
    services: [
      { name: "Nattes simples", price: 1000 },
      { name: "Gros rasta", price: 4000 },
      { name: "Moyens rasta", price: 6500 },
      { name: "Petit rasta", price: 8500 },
      { name: "Gros rasta américains", price: 6000 },
      { name: "Moyens rasta américains", price: 8000 },
      { name: "Petit rasta américains", price: 10000 },
      { name: "Micro twist (AP)", price: 25000 },
      { name: "Passe mèche (AP)", price: 5000 },
      { name: "Dreadlocks (AP)", price: 25000 },
      { name: "Retouche dreadlocks (AP)", price: 15000 },
      { name: "Faux locks (AP)", price: 5000 },
    ],
  },
  {
    category: "Pose perruque",
    services: [
      { name: "Perruque", price: 3000 },
      { name: "Closure", price: 4000 },
      { name: "Lace frontale", price: 5000 },
      { name: "Lace + customisation", price: 8000 },
      { name: "Chignon avec lace", price: 5000 },
      { name: "Coiffure perruque (AP)", price: 3000 },
    ],
  },
  {
    category: "Enfant",
    services: [
      { name: "Nattes simples", price: 1000 },
      { name: "Renversés en pompon", price: 2500 },
      { name: "Rasta", price: 5000 },
      { name: "Curly", price: 3000 },
      { name: "Chignon", price: 2000 },
    ],
  },
  {
    category: "Beauty",
    services: [
      { name: "Babyliss", price: 5000 },
      { name: "Brushing (AP)", price: 3000 },
      { name: "Lissage (AP)", price: 4000 },
      { name: "Curly (AP)", price: 10000 },
    ],
  },
];

async function getExistingTenant() {
  const tenants = await prisma.tenant.findMany({
    where: { name: TENANT_NAME },
    take: 2,
    select: { id: true, name: true },
  });

  if (tenants.length === 0) {
    throw new Error(
      `Aucun tenant « ${TENANT_NAME} » trouvé — exécuter npm run seed:dev avant cet import.`,
    );
  }
  if (tenants.length > 1) {
    throw new Error(`Plusieurs tenants portent le nom « ${TENANT_NAME} ».`);
  }
  return tenants[0];
}

async function upsertCategory(tx, tenantId, name) {
  const existing = await tx.serviceCategory.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing) {
    await tx.serviceCategory.update({
      where: { id: existing.id },
      data: { name, active: true, isDeleted: false, deletedAt: null },
    });
    return { id: existing.id, wasCreated: false };
  }

  const created = await tx.serviceCategory.create({
    data: { tenantId, name },
    select: { id: true },
  });
  return { id: created.id, wasCreated: true };
}

async function upsertService(tx, tenantId, categoryId, name, price) {
  const existing = await tx.service.findFirst({
    where: { tenantId, categoryId, name: { equals: name, mode: "insensitive" } },
    select: { id: true, defaultPrice: true },
  });

  if (existing) {
    await tx.service.update({
      where: { id: existing.id },
      data: { name, defaultPrice: price, active: true, isDeleted: false, deletedAt: null },
    });
    return { wasCreated: false, wasUpdated: existing.defaultPrice !== price };
  }

  await tx.service.create({ data: { tenantId, categoryId, name, defaultPrice: price } });
  return { wasCreated: true, wasUpdated: false };
}

async function upsertJobTitle(tx, tenantId, name) {
  const existing = await tx.jobTitle.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing) {
    await tx.jobTitle.update({
      where: { id: existing.id },
      data: { name, active: true, isDeleted: false, deletedAt: null },
    });
    return false;
  }

  await tx.jobTitle.create({ data: { tenantId, name } });
  return true;
}

async function main() {
  const tenant = await getExistingTenant();

  let categoriesCreated = 0;
  let categoriesExisting = 0;
  let servicesCreated = 0;
  let servicesUpdated = 0;
  let servicesUnchanged = 0;
  let jobTitlesCreated = 0;
  let jobTitlesExisting = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const name of JOB_TITLES) {
        if (await upsertJobTitle(tx, tenant.id, name)) jobTitlesCreated += 1;
        else jobTitlesExisting += 1;
      }

      for (const { category, services } of CATALOGUE) {
        const { id: categoryId, wasCreated } = await upsertCategory(tx, tenant.id, category);
        if (wasCreated) categoriesCreated += 1;
        else categoriesExisting += 1;

        for (const { name, price } of services) {
          const result = await upsertService(tx, tenant.id, categoryId, name, price);
          if (result.wasCreated) servicesCreated += 1;
          else if (result.wasUpdated) servicesUpdated += 1;
          else servicesUnchanged += 1;
        }
      }
    },
    { timeout: 30_000 },
  );

  const totalCategories = categoriesCreated + categoriesExisting;
  const totalServices = servicesCreated + servicesUpdated + servicesUnchanged;

  console.log("\nImport du catalogue Caprice D'Ebène terminé.");
  console.log(`Tenant                    : ${tenant.name} (${tenant.id})`);
  console.log(
    `Postes                    : ${JOB_TITLES.length} (${jobTitlesCreated} créés, ${jobTitlesExisting} déjà existants)`,
  );
  console.log(
    `Catégories                : ${totalCategories} (${categoriesCreated} créées, ${categoriesExisting} déjà existantes)`,
  );
  console.log(
    `Prestations               : ${totalServices} (${servicesCreated} créées, ${servicesUpdated} mises à jour, ${servicesUnchanged} inchangées)\n`,
  );
}

main()
  .catch((error) => {
    console.error("\nÉchec de l'import du catalogue:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
