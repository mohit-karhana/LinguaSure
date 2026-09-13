import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function validateSignup({ name, email, password }) {
  const trimmedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const pass = String(password || "");

  if (trimmedName.length < 2 || trimmedName.length > 80) {
    return { error: "Name must be between 2 and 80 characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { error: "Enter a valid email address." };
  }
  if (pass.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  return { name: trimmedName, email: normalizedEmail, password: pass };
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${Buffer.from(hash).toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
