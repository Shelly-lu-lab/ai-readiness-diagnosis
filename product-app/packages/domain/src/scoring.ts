import { createHash, randomUUID } from "node:crypto";
import { VERSION_TUPLE, type ClassificationId, type DimensionId, type MetricValue, type RawAnswer, type ScoreSnapshot } from "@ai-readiness/contracts";
import { DIMENSION_ITEMS } from "./questionnaire.js";

const DIMENSION_IDS = Object.keys(DIMENSION_ITEMS) as DimensionId[];

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function metric(value: number | null, validCount: number, totalCount: number, applicable = true): MetricValue {
  return { value, validCount, totalCount, status: !applicable ? "not_applicable" : value === null ? "insufficient" : "scored" };
}

export function standardize(raw: RawAnswer): number | null {
  return raw === null || raw < 1 || raw > 5 ? null : (raw - 1) * 25;
}

export function classification(capability: number | null, readiness: number | null): ClassificationId | null {
  if (capability === null || readiness === null) return null;
  if (capability >= 70 && readiness >= 70) return "FRONTIER";
  if (capability >= 70 && readiness < 55) return "BLOCKED_AGENCY";
  if (readiness >= 70 && capability < 55) return "UNCLAIMED_CAPACITY";
  if (capability < 45 && readiness < 45) return "STALLED";
  return "EMERGENT";
}

export function scoreAnswers(answers: Record<string, RawAnswer>, now = new Date()): ScoreSnapshot {
  const items = Object.fromEntries(Object.entries(answers).map(([id, raw]) => [id, standardize(raw)]));
  const dimensions = {} as Record<DimensionId, MetricValue>;
  for (const id of DIMENSION_IDS) {
    const expected = DIMENSION_ITEMS[id];
    const values = expected.map((itemId) => items[itemId]).filter((value): value is number => typeof value === "number");
    dimensions[id] = metric(values.length >= 3 ? average(values) : null, values.length, 4, expected.some((itemId) => Object.hasOwn(answers, itemId)));
  }
  const axis = (ids: DimensionId[]) => {
    const relevantItems = ids.flatMap((id) => DIMENSION_ITEMS[id]);
    const validCount = relevantItems.filter((id) => typeof items[id] === "number").length;
    const values = ids.map((id) => dimensions[id].value).filter((value): value is number => value !== null);
    const applicable = relevantItems.some((id) => Object.hasOwn(answers, id));
    return metric(validCount >= 12 && values.length === 4 ? average(values) : null, validCount, 16, applicable);
  };
  const employeeAiCapability = axis(["A1", "A2", "A3", "A4"]);
  const organizationalAiReadiness = axis(["B1", "B2", "B3", "B4"]);
  const impactItems = Array.from({ length: 10 }, (_, index) => `V${String(index + 1).padStart(2, "0")}`);
  const impactValues = impactItems.map((id) => items[id]).filter((value): value is number => typeof value === "number");
  const impactApplicable = impactItems.some((id) => Object.hasOwn(answers, id));
  const realizedAiImpact = metric(impactValues.length >= 7 ? average(impactValues) : null, impactValues.length, 10, impactApplicable);
  const canonicalInput = JSON.stringify({ answers: Object.fromEntries(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b))), versions: VERSION_TUPLE });
  return {
    id: randomUUID(),
    createdAt: now.toISOString(),
    versions: VERSION_TUPLE,
    answers,
    items,
    dimensions,
    employeeAiCapability,
    organizationalAiReadiness,
    realizedAiImpact,
    classificationId: classification(employeeAiCapability.value, organizationalAiReadiness.value),
    inputHash: createHash("sha256").update(canonicalInput).digest("hex")
  };
}

export function scoreBand(score: number | null): "S1" | "S2" | "S3" | "S4" | null {
  if (score === null) return null;
  if (score < 45) return "S1";
  if (score < 55) return "S2";
  if (score < 70) return "S3";
  return "S4";
}

export function aggregateScoreSnapshots(snapshots: ScoreSnapshot[], now = new Date()): ScoreSnapshot {
  const meanValues = (values: Array<number | null>) => average(values.filter((value): value is number => value !== null));
  const itemIds = [...new Set(snapshots.flatMap((snapshot) => Object.keys(snapshot.items)))].sort();
  const items = Object.fromEntries(itemIds.map((id) => [id, meanValues(snapshots.map((snapshot) => snapshot.items[id] ?? null))]));
  const dimensions = {} as Record<DimensionId, MetricValue>;
  for (const id of DIMENSION_IDS) {
    const values = snapshots.map((snapshot) => snapshot.dimensions[id].value);
    const value = meanValues(values);
    dimensions[id] = metric(value, values.filter((entry) => entry !== null).length, snapshots.length, snapshots.some((snapshot) => snapshot.dimensions[id].status !== "not_applicable"));
  }
  const aggregateMetric = (selector: (snapshot: ScoreSnapshot) => MetricValue, totalCount: number) => {
    const selected = snapshots.map(selector);
    const values = selected.map((entry) => entry.value);
    return metric(meanValues(values), values.filter((entry) => entry !== null).length, totalCount, selected.some((entry) => entry.status !== "not_applicable"));
  };
  const employeeAiCapability = aggregateMetric((snapshot) => snapshot.employeeAiCapability, snapshots.length);
  const organizationalAiReadiness = aggregateMetric((snapshot) => snapshot.organizationalAiReadiness, snapshots.length);
  const realizedAiImpact = aggregateMetric((snapshot) => snapshot.realizedAiImpact, snapshots.length);
  const inputHash = createHash("sha256").update(JSON.stringify({ scoreHashes: snapshots.map((snapshot) => snapshot.inputHash).sort(), versions: VERSION_TUPLE })).digest("hex");
  return {
    id: randomUUID(), createdAt: now.toISOString(), versions: VERSION_TUPLE, answers: {}, items, dimensions,
    employeeAiCapability, organizationalAiReadiness, realizedAiImpact,
    classificationId: classification(employeeAiCapability.value, organizationalAiReadiness.value), inputHash
  };
}
