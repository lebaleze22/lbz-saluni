import type { AppointmentStatus } from "@prisma/client";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Planifié",
  confirmed: "Confirmé",
  arrived: "Arrivé",
  completed: "Terminé",
  cancelled: "Annulé",
  no_show: "Absent",
};

export const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed", "arrived"];
