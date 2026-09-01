import { describe, expect, it } from "vitest";
import { staffCreateSchema } from "./staff";

const TITLE_ID = "7cd9a8e4-b350-4a03-b1a7-904ba3ddb07e";

const validInput = {
  name: "Grâce",
  sex: "femme",
  phone: "699000000",
  residence: "Douala",
  idType: "cni",
  idNumber: "123456789",
  yearsOfExperience: "5",
  jobTitleIds: [TITLE_ID],
  primaryJobTitleId: TITLE_ID,
  newJobTitle: "",
  newJobTitleIsPrimary: false,
  payType: "fixed_salary",
  payAmount: "120000",
  systemRole: "none",
  email: "",
  password: "",
};

describe("validation du staff", () => {
  it("accepte un profil complet avec salaire fixe et poste principal", () => {
    expect(staffCreateSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepte l'absence réelle des champs de compte quand le rôle système vaut none", () => {
    expect(
      staffCreateSchema.safeParse({
        ...validInput,
        email: null,
        password: null,
      }).success,
    ).toBe(true);
  });

  it("accepte plusieurs postes avec un seul poste principal", () => {
    const secondTitleId = "91b3a8e4-b350-4a03-b1a7-904ba3ddb07e";
    expect(
      staffCreateSchema.safeParse({
        ...validInput,
        jobTitleIds: [TITLE_ID, secondTitleId],
        primaryJobTitleId: secondTitleId,
      }).success,
    ).toBe(true);
  });

  it("exige un poste principal parmi les postes sélectionnés", () => {
    const result = staffCreateSchema.safeParse({
      ...validInput,
      primaryJobTitleId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.primaryJobTitleId).toBeDefined();
    }
  });

  it("exige aussi de marquer un nouveau poste comme principal s'il est seul", () => {
    expect(
      staffCreateSchema.safeParse({
        ...validInput,
        jobTitleIds: [],
        primaryJobTitleId: "",
        newJobTitle: "Coloriste",
        newJobTitleIsPrimary: false,
      }).success,
    ).toBe(false);
  });

  it("valide ensemble le type et le numéro de pièce", () => {
    const result = staffCreateSchema.safeParse({
      ...validInput,
      idNumber: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.idNumber).toBeDefined();
    }
  });

  it("refuse une commission supérieure à 100 %", () => {
    expect(
      staffCreateSchema.safeParse({
        ...validInput,
        payType: "commission",
        payAmount: "101",
      }).success,
    ).toBe(false);
  });

  it("exige un salaire fixe entier en FCFA", () => {
    expect(staffCreateSchema.safeParse({ ...validInput, payAmount: "120000.5" }).success).toBe(
      false,
    );
  });

  it("exige des identifiants pour un rôle système", () => {
    const result = staffCreateSchema.safeParse({
      ...validInput,
      systemRole: "director",
      email: "invalide",
      password: "court",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });
});
