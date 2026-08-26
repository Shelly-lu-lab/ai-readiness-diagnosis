import { describe, expect, it } from "vitest";
import { organizationWorkspaceLanding, parseEmailInvitationCsv } from "./App";

describe("organization workspace role landing", () => {
  it("keeps enterprise employees inside an enterprise member home", () => {
    expect(organizationWorkspaceLanding("employee")).toBe("member");
  });

  it("routes managers to reports and administrators to campaign operations", () => {
    expect(organizationWorkspaceLanding("manager")).toBe("reports");
    expect(organizationWorkspaceLanding("hr_admin")).toBe("admin");
    expect(organizationWorkspaceLanding("owner")).toBe("admin");
  });
});

describe("email invitation CSV parsing", () => {
  it("reads a named email column and removes duplicates", () => {
    expect(parseEmailInvitationCsv("name,email\n张三,A@example.com\n李四,a@example.com\n王五,b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("accepts a headerless single-column CSV", () => {
    expect(parseEmailInvitationCsv("first@example.com\nsecond@example.com")).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
  });
});
