import { describe, expect, it } from "vitest";
import { registerStaffSelect } from "./register-staff-select";

describe("projection staff du registre", () => {
  it("n'expose que l'identité et les postes utiles au sélecteur", () => {
    expect(Object.keys(registerStaffSelect).sort()).toEqual(["id", "jobTitles", "name"]);
    expect(registerStaffSelect).not.toHaveProperty("idType");
    expect(registerStaffSelect).not.toHaveProperty("idNumber");
    expect(registerStaffSelect.jobTitles.select.jobTitle.select).toEqual({ id: true, name: true });
  });
});
