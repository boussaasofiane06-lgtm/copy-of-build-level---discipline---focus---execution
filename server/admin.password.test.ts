import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyAdminPassword } from "./_core/adminAuth";

function createPasswordHash(password: string): string {
  const salt = "admin-password-test-salt";
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

describe("Admin password verification", () => {
  const stored = createPasswordHash("!@#$9379&*()");

  it("verifies the correct password against the stored hash", () => {
    const result = verifyAdminPassword("!@#$9379&*()", stored);
    expect(result).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const result = verifyAdminPassword("wrongpassword", stored);
    expect(result).toBe(false);
  });

  it("rejects malformed hashes", () => {
    expect(verifyAdminPassword("!@#$9379&*()", "")).toBe(false);
    expect(verifyAdminPassword("!@#$9379&*()", "not-a-valid-hash")).toBe(false);
  });
});
