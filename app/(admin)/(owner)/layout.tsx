import { redirect } from "next/navigation";
import { AccessDeniedError, requireOwner } from "@/lib/db/auth";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireOwner();
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/register");
    throw error;
  }

  return children;
}
