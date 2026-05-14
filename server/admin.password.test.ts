import { describe, it, expect } from "vitest";
import crypto from "crypto";

function verifyPassword(input: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = crypto.scryptSync(input, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

describe("Admin password hash", () => {
  it("ADMIN_PASSWORD_HASH env var is set", () => {
    expect(process.env.ADMIN_PASSWORD_HASH).toBeTruthy();
  });

  it("verifies the correct password against the stored hash", () => {
    const stored = process.env.ADMIN_PASSWORD_HASH || "";
    const result = verifyPassword("!@#$9379&*()", stored);
    expect(result).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const stored = process.env.ADMIN_PASSWORD_HASH || "";
    const result = verifyPassword("wrongpassword", stored);
    expect(result).toBe(false);
  });
});
