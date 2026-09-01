import { getJobTitlesPageData } from "@/lib/db/job-titles";
import { JobTitleManager } from "./job-title-manager";
export const dynamic = "force-dynamic";
export default async function JobTitlesPage() {
  return <JobTitleManager titles={await getJobTitlesPageData()} />;
}
