import { getStaffPageData } from "@/lib/db/staff";
import { StaffManager } from "./staff-manager";
export const dynamic = "force-dynamic";
export default async function StaffPage() {
  const [members, titles] = await getStaffPageData();
  return <StaffManager members={members} titles={titles} />;
}
