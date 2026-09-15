import { describe, expect, it } from "vitest";
import {
  appointmentCheckoutSchema,
  appointmentInputSchema,
  calendarFiltersSchema,
} from "./appointments";

const id = "11111111-1111-4111-8111-111111111111";
const valid = {
  clientId: id,
  clientName: "Cliente",
  staffId: "22222222-2222-4222-8222-222222222222",
  startTime: "2030-01-02T09:00:00.000Z",
  durationMinutes: "60",
  services: [{ serviceId: "33333333-3333-4333-8333-333333333333", price: "5000" }],
};

describe("appointment validation", () => {
  it("normalizes a valid appointment", () => {
    expect(appointmentInputSchema.parse(valid)).toMatchObject({
      durationMinutes: 60,
      clientId: id,
    });
  });
  it("rejects repeated services and invalid durations", () => {
    expect(
      appointmentInputSchema.safeParse({
        ...valid,
        durationMinutes: 4,
        services: [valid.services[0], valid.services[0]],
      }).success,
    ).toBe(false);
  });
  it("validates calendar filters and checkout methods", () => {
    expect(calendarFiltersSchema.parse({ date: "2030-01-02" })).toMatchObject({
      view: "day",
      status: "all",
    });
    expect(appointmentCheckoutSchema.safeParse({ id, paymentMethod: "card" }).success).toBe(false);
  });
  it("accepts unpaid and partial bookings but rejects overpayment", () => {
    expect(appointmentInputSchema.safeParse({ ...valid, paymentAmount: 0 }).success).toBe(true);
    expect(
      appointmentInputSchema.safeParse({
        ...valid,
        paymentAmount: 2_000,
        paymentMethod: "cash",
      }).success,
    ).toBe(true);
    expect(
      appointmentInputSchema.safeParse({
        ...valid,
        paymentAmount: 6_000,
        paymentMethod: "cash",
      }).success,
    ).toBe(false);
  });
});
