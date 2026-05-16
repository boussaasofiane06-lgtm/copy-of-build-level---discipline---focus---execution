#!/usr/bin/env node
/**
 * Generate ADMIN_PASSWORD_HASH for your .env file
 * Usage: node scripts/hash-password.mjs yourpassword
 */
import { scryptSync, randomBytes } from "crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 32).toString("hex");
console.log(`\nADMIN_PASSWORD_HASH=${salt}:${hash}\n`);
console.log("Add this to your Render environment variables.");
