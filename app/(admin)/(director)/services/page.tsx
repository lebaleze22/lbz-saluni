import { getServicesPageData } from "@/lib/db/services";
import { ServiceManager } from "@/app/(admin)/(director)/services/service-manager";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [services, categories] = await getServicesPageData();
  return (
    <>
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <Link href="/inventory/recipes" className="text-sm font-bold text-emerald-800 underline">
          Configurer les produits consommés par prestation
        </Link>
      </div>
      <ServiceManager services={services} categories={categories} />
    </>
  );
}
