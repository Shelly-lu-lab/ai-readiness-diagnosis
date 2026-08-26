import { describe, expect, it } from "vitest";
import type { RawAnswer } from "@ai-readiness/contracts";
import {
  DIMENSION_ITEMS,
  QUESTIONNAIRE_ITEMS,
  classification,
  itemIdsForTarget,
  scoreAnswers,
  scoreBand,
  standardize,
} from "./index.js";

const answersFor = (ids: string[], raw: 1 | 2 | 3 | 4 | 5): Record<string, RawAnswer> => Object.fromEntries(ids.map((id) => [id, raw]));
const allIds = QUESTIONNAIRE_ITEMS.map((item) => item.id);
const capabilityIds = [
  ...DIMENSION_ITEMS.A1,
  ...DIMENSION_ITEMS.A2,
  ...DIMENSION_ITEMS.A3,
  ...DIMENSION_ITEMS.A4,
];
const readinessIds = [
  ...DIMENSION_ITEMS.B1,
  ...DIMENSION_ITEMS.B2,
  ...DIMENSION_ITEMS.B3,
  ...DIMENSION_ITEMS.B4,
];

describe("scoring v1.1", () => {
  it("maps the unified scale to 0-100", () => {
    expect([1, 2, 3, 4, 5].map((value) => standardize(value as 1 | 2 | 3 | 4 | 5))).toEqual([0, 25, 50, 75, 100]);
  });

  it("scores a complete all-high profile as frontier", () => {
    const result = scoreAnswers(answersFor(allIds, 5), new Date("2026-08-10T00:00:00Z"));
    expect(result.employeeAiCapability.value).toBe(100);
    expect(result.organizationalAiReadiness.value).toBe(100);
    expect(result.realizedAiImpact.value).toBe(100);
    expect(result.classificationId).toBe("FRONTIER");
  });

  it("scores a complete all-low profile as stalled", () => {
    const result = scoreAnswers(answersFor(allIds, 1));
    expect(result.employeeAiCapability.value).toBe(0);
    expect(result.organizationalAiReadiness.value).toBe(0);
    expect(result.classificationId).toBe("STALLED");
  });

  it("does not reweight an axis when one dimension is invalid", () => {
    const answers = answersFor(itemIdsForTarget("combined"), 4);
    answers.I03 = null;
    answers.I04 = null;
    const result = scoreAnswers(answers);
    expect(result.dimensions.A1.status).toBe("insufficient");
    expect(result.employeeAiCapability.value).toBeNull();
    expect(result.classificationId).toBeNull();
  });

  it("requires three valid answers for each dimension", () => {
    const answers = answersFor(DIMENSION_ITEMS.A1, 4);
    answers.I04 = null;
    const result = scoreAnswers(answers);
    expect(result.dimensions.A1.value).toBe(75);
    answers.I03 = null;
    const insufficient = scoreAnswers(answers);
    expect(insufficient.dimensions.A1.value).toBeNull();
  });

  it("separates not-applicable package metrics from insufficient metrics", () => {
    const result = scoreAnswers(answersFor(itemIdsForTarget("personal"), 3));
    expect(result.organizationalAiReadiness.status).toBe("not_applicable");
    expect(result.employeeAiCapability.status).toBe("scored");
  });

  it("creates a stable input hash independent of property order", () => {
    const first = scoreAnswers({ I01: 4, I02: 3 });
    const second = scoreAnswers({ I02: 3, I01: 4 });
    expect(first.inputHash).toBe(second.inputHash);
  });

  it("covers all five classification regions at their intended boundaries", () => {
    expect(classification(70, 70)).toBe("FRONTIER");
    expect(classification(70, 54.9)).toBe("BLOCKED_AGENCY");
    expect(classification(54.9, 70)).toBe("UNCLAIMED_CAPACITY");
    expect(classification(44.9, 44.9)).toBe("STALLED");
    expect(classification(50, 50)).toBe("EMERGENT");
    expect(classification(17.2, 50)).toBe("EMERGENT");
    expect(classification(50, 17.2)).toBe("EMERGENT");
    expect(classification(60, 80)).toBe("EMERGENT");
    expect(classification(80, 60)).toBe("EMERGENT");
    expect(classification(null, 70)).toBeNull();
  });

  it("keeps 45, 55 and 70 as exact score-band boundaries", () => {
    expect([
      scoreBand(44.9),
      scoreBand(45),
      scoreBand(54.9),
      scoreBand(55),
      scoreBand(69.9),
      scoreBand(70),
    ]).toEqual(["S1", "S2", "S2", "S3", "S3", "S4"]);
  });

  it("matches the 16, 26 and 42 item package boundaries", () => {
    const personal = itemIdsForTarget("personal");
    const organization = itemIdsForTarget("organization");
    const combined = itemIdsForTarget("combined");
    expect(personal).toHaveLength(26);
    expect(organization).toHaveLength(16);
    expect(combined).toHaveLength(42);
    expect(personal.filter((id) => id.startsWith("I"))).toHaveLength(16);
    expect(personal.filter((id) => id.startsWith("V"))).toHaveLength(10);
    expect(organization.every((id) => id.startsWith("O"))).toBe(true);
  });

  it("scores the middle, blocked-agency and unclaimed-capacity golden profiles", () => {
    const middle = scoreAnswers(answersFor(allIds, 3));
    expect(middle).toMatchObject({
      classificationId: "EMERGENT",
      employeeAiCapability: { value: 50 },
      organizationalAiReadiness: { value: 50 },
      realizedAiImpact: { value: 50 },
    });
    const blocked = scoreAnswers({
      ...answersFor(itemIdsForTarget("personal"), 4),
      ...answersFor(itemIdsForTarget("organization"), 3),
    });
    expect(blocked.classificationId).toBe("BLOCKED_AGENCY");
    const unclaimed = scoreAnswers({
      ...answersFor(itemIdsForTarget("personal"), 3),
      ...answersFor(itemIdsForTarget("organization"), 4),
    });
    expect(unclaimed.classificationId).toBe("UNCLAIMED_CAPACITY");
  });

  it("keeps organization readiness unchanged when only personal capability moves high", () => {
    const organizationLowBaseline = scoreAnswers({
      ...answersFor(allIds, 3),
      ...answersFor(readinessIds, 1),
    });
    const result = scoreAnswers({
      ...answersFor(allIds, 3),
      ...answersFor(capabilityIds, 5),
      ...answersFor(readinessIds, 1),
    });

    expect(result.employeeAiCapability.value).toBe(100);
    expect(result.organizationalAiReadiness).toEqual(
      organizationLowBaseline.organizationalAiReadiness,
    );
    expect(result.realizedAiImpact).toEqual(
      organizationLowBaseline.realizedAiImpact,
    );
    expect(result.classificationId).toBe("BLOCKED_AGENCY");
  });

  it("keeps personal capability unchanged when only organization readiness moves high", () => {
    const personalLowBaseline = scoreAnswers({
      ...answersFor(allIds, 3),
      ...answersFor(capabilityIds, 1),
    });
    const result = scoreAnswers({
      ...answersFor(allIds, 3),
      ...answersFor(capabilityIds, 1),
      ...answersFor(readinessIds, 5),
    });

    expect(result.organizationalAiReadiness.value).toBe(100);
    expect(result.employeeAiCapability).toEqual(
      personalLowBaseline.employeeAiCapability,
    );
    expect(result.realizedAiImpact).toEqual(personalLowBaseline.realizedAiImpact);
    expect(result.classificationId).toBe("UNCLAIMED_CAPACITY");
  });

  it("does not score realized impact when only six impact items are valid", () => {
    const answers = answersFor(itemIdsForTarget("personal"), 4);
    for (const id of ["V07", "V08", "V09", "V10"]) answers[id] = null;
    const result = scoreAnswers(answers);
    expect(result.realizedAiImpact).toMatchObject({
      value: null,
      status: "insufficient",
      validCount: 6,
      totalCount: 10,
    });
  });
});
