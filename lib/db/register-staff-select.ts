import type { Prisma } from "@prisma/client";

// Contrat de sécurité du sélecteur du registre : aucune donnée administrative
// sensible (idType, idNumber, etc.) ne doit être ajoutée à cette projection.
export const registerStaffSelect = {
  id: true,
  name: true,
  jobTitles: {
    orderBy: { isPrimary: "desc" },
    select: {
      isPrimary: true,
      jobTitle: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.StaffSelect;
