import type {
  AppointmentSource,
  AppointmentStatus,
  PaymentMethod,
  PaymentPurpose,
} from "@prisma/client";

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
    purpose?: PaymentPurpose;
    receivedAt?: Date;
  }>;
};

export type ServicePaymentRow = {
  amount: number;
  method: PaymentMethod;
  purpose: PaymentPurpose;
};

export type RetailReportRow = {
  id: string;
  soldAt: Date;
  productId: string;
  productName: string;
  quantity: string;
  unit: string;
  unitPrice: number;
  total: number;
  method: PaymentMethod;
  clientName: string | null;
  recordedByName: string;
};

export type NamedAmount = {
  id: string;
  label: string;
  amount: number;
  count: number;
};

export type ProductAmount = {
  id: string;
  label: string;
  amount: number;
  saleCount: number;
  quantity: string;
  unit: string;
};

export type PaymentAmount = {
  method: PaymentMethod;
  label: string;
  amount: number;
  count: number;
};

export type ReportSummary = {
  totalRevenue: number;
  serviceRevenue: number;
  retailRevenue: number;
  totalCashReceived: number;
  serviceReceipts: number;
  advanceReceipts: number;
  totalExpenses: number;
  netResult: number;
  paymentMethods: PaymentAmount[];
  staff: NamedAmount[];
  services: NamedAmount[];
  serviceVolume: number;
  retailSaleVolume: number;
  products: ProductAmount[];
  retailQuantitiesByUnit: Array<{ unit: string; quantity: string }>;
  visitVolume: number;
  uniqueClients: number;
  newClients: number;
  recurringClients: number;
  appointmentOutcomes: Record<AppointmentStatus, number>;
  bookingPayments: {
    unpaid: number;
    partial: number;
    paid: number;
    outstandingAmount: number;
  };
};

export type ReportData = {
  range: ReportDateRange;
  rows: ReportRow[];
  retailSales: RetailReportRow[];
  summary: ReportSummary;
};
