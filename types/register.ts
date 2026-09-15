import type {
  AppointmentSource,
  AppointmentStatus,
  PaymentMethod,
  PaymentPurpose,
} from "@prisma/client";

export type StaffOption = {
  id: string;
  name: string;
  jobTitles: Array<{
    id: string;
    name: string;
    isPrimary: boolean;
  }>;
};

export type ServiceOption = {
  id: string;
  name: string;
  defaultPrice: number;
  category: {
    id: string;
    name: string;
  } | null;
};

export type ClientOption = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  sex?: "homme" | "femme" | null;
};

export type RegisterEntry = {
  id: string;
  startTime: Date;
  source: AppointmentSource;
  status: AppointmentStatus;
  client: ClientOption;
  staff: Pick<StaffOption, "id" | "name">;
  services: Array<{
    id: string;
    name: string;
    price: number;
  }>;
  payments: Array<{
    amount: number;
    method: PaymentMethod;
    purpose: PaymentPurpose;
  }>;
};

export type RegisterPageData = {
  staff: StaffOption[];
  services: ServiceOption[];
  clients: ClientOption[];
  entries: RegisterEntry[];
  serviceReceipts: number;
  retailReceipts: number;
  completedVisitCount: number;
};
