import type { AppointmentSource, PaymentMethod } from "@prisma/client";

export type StaffOption = {
  id: string;
  name: string;
};

export type ServiceOption = {
  id: string;
  name: string;
  defaultPrice: number;
};

export type ClientOption = {
  id: string;
  name: string;
  phone: string | null;
};

export type RegisterEntry = {
  id: string;
  startTime: Date;
  source: AppointmentSource;
  client: ClientOption;
  staff: StaffOption;
  services: Array<{
    id: string;
    name: string;
    price: number;
  }>;
  payment: {
    amount: number;
    method: PaymentMethod;
  } | null;
};

export type RegisterPageData = {
  staff: StaffOption[];
  services: ServiceOption[];
  clients: ClientOption[];
  entries: RegisterEntry[];
};
