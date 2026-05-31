import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  return { salt, passwordHash };
}

export function verifyPassword(password: string, salt: string, passwordHash: string) {
  const attempted = scryptSync(password, salt, 64);
  const expected = Buffer.from(passwordHash, "hex");

  if (attempted.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(attempted, expected);
}
