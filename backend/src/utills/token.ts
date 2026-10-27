import { createHash, randomBytes } from "node:crypto";

export const REFRESH_TTL_MS=7*24*60*60*1000 // 7 days

export function generateRefreshToken():string{
  return randomBytes(48).toString("base64url")
}

export function hashToken(token:string):string{
  return createHash("sha256").update(token).digest("hex")
}
