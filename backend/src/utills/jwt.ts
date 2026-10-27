import jwt from "jsonwebtoken"
import type { AccessTokenPayLoad } from "../types/auth.types.js"

const TOKEN_TTL=60*15 // 15 minutes, the refresh token keeps users logged in

function jwtSecret():string{
  const secret=process.env.JWT_SECRET
  if(!secret) throw new Error("JWT_SECRET is not set")
  return secret;
}

export function signToken(payload:AccessTokenPayLoad):string{
  return jwt.sign(payload,jwtSecret(),{expiresIn:TOKEN_TTL})
}

export function verifyToken(token: string): AccessTokenPayLoad {
  const decoded = jwt.verify(token, jwtSecret());

  if (
    typeof decoded !== "object" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string"
  ) {
    throw new Error("Invalid token payload");
  }

  return { sub: decoded.sub, email: decoded.email };
}