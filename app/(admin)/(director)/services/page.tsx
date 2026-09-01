import { getServicesPageData } from "@/lib/db/services";
import { ServiceManager } from "@/app/(admin)/(director)/services/service-manager";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [services, categories] = await getServicesPageData();
  return <ServiceManager services={services} categories={categories} />;
}
