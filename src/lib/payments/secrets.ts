import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/env";
import { AppError } from "@/lib/errors";

const VERSION = "v1";

function key(): Buffer {
  if (!env.PAYMENTS_ENCRYPTION_KEY)
    throw new AppError(
      "UNAVAILABLE",
      "Online payments aren't set up on this server yet (PAYMENTS_ENCRYPTION_KEY is missing).",
    );
  return Buffer.from(env.PAYMENTS_ENCRYPTION_KEY, "base64");
}

/** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encryptSecret(plain: string, encryptionKey: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(sealed: string, encryptionKey: Buffer = key()): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
