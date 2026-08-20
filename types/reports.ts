import type { AppointmentSource, PaymentMethod } from "@prisma/client";

export type ReportPeriod = "week" | "month" | "quarter";

export type ReportDateRange = {
  period: ReportPeriod;
  referenceDate: string;
  start: Date;
  end: Date;
  label: string;
};

export type ReportRow = {
  appointmentId: string;
  startTime: Date;
  source: AppointmentSource;
  client: {
    id: string;
    name: string;
    firstAppointmentAt: Date;
  };
  staff: {
    id: string;
    name: string;
  };
  services: Array<{
    id: string;
    name: string;
    price: number;
  }>;
  payments: Array<{
    amount: number;
    method: PaymentMethod;
  }>;
};

export type NamedAmount = {
  id: string;
  label: string;
  amount: number;
  count: number;
};

export type PaymentAmount = {
  method: PaymentMethod;
  label: string;
  amount: number;
  count: number;
};

export type ReportSummary = {
  totalRevenue: number;
  paymentMethods: PaymentAmount[];
  staff: NamedAmount[];
  services: NamedAmount[];
  serviceVolume: number;
  visitVolume: number;
  uniqueClients: number;
  newClients: number;
  recurringClients: number;
};

export type ReportData = {
  range: ReportDateRange;
  rows: ReportRow[];
  summary: ReportSummary;
};
