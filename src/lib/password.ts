import { createHash } from "crypto";

export function hashPassword(password: string): string {
  return createHash("sha256").update(password.trim()).digest("hex");
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  return hashPassword(password) === passwordHash;
}
