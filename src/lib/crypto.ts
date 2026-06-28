import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_ENV = "ENCRYPTION_KEY";

export function hasEncryptionKey(): boolean {
  return !!config.ENCRYPTION_KEY;
}

function getKey(): Buffer {
  const hex = config.ENCRYPTION_KEY!;
  const raw = Buffer.from(hex, "hex");
  if (raw.length !== 32)
    throw new Error(`${KEY_ENV} must be 64 hex characters (32 bytes for AES-256)`);
  return raw;
}

export function encrypt(plaintext: string): string {
  if (!plaintext || !hasEncryptionKey()) return plaintext;
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(":") || !hasEncryptionKey()) return ciphertext;
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  const [iv = "", encrypted = "", tag = ""] = parts;
  if (!iv || !encrypted || !tag) return ciphertext;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
