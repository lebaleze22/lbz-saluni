import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export class AccessDeniedError extends Error {
  constructor(message = "Vous devez être connecté comme gérant du salon.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export async function requireSalonAdmin() {
  const supabase = createClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) {
    throw new AccessDeniedError();
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, tenantId: true, fullName: true, role: true },
  });

  if (!user || user.role !== "salon_admin") {
    throw new AccessDeniedError(
      "Seul le directeur ou le gérant du salon peut accéder à cette fonction.",
    );
  }

  return user;
}
