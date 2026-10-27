import { authRepo } from "../repositories/auth.repo.js";
import type { LoginInput, RegisterInput, SessionMeta } from "../types/auth.types.js";
import { comparePassword, hashPassword } from "../utills/hash.js";
import { signToken } from "../utills/jwt.js";
import { generateRefreshToken, hashToken, REFRESH_TTL_MS } from "../utills/token.js";

async function createRefreshToken(userId:string,meta:SessionMeta){
  const refreshToken=generateRefreshToken()
  await authRepo.createSession({
    userId,
    tokenHash:hashToken(refreshToken),
    expiredAt:new Date(Date.now()+REFRESH_TTL_MS),
    userAgent:meta.userAgent,
    ipAddress:meta.ipAddress
  })
  return refreshToken
}

export async function register(data:RegisterInput,meta:SessionMeta) {
  if(!data.email || !data.name || !data.password){
    throw new Error("Please provide name,email and password")
  }
  const email=data.email.trim().toLowerCase()
  const existingUser=await authRepo.findUserByEmail(email)
  if(existingUser){
    throw new Error("Email is already registered")
  }
  const passwordHash=await hashPassword(data.password);
  const user=await authRepo.createUser({
    name:data.name.trim(),
    email,
    passwordHash
  })
  const accessToken=signToken({sub:user.id,email:user.email})
  const refreshToken=await createRefreshToken(user.id,meta)
  return{
    user:{
      id:user.id,
      name:user.name,
      email:user.email,
      isActive:user.isActive,
      createdAt:user.createdAt,
      updatedAt:user.updatedAt
    },
    accessToken,
    refreshToken
  }
}

export async function login(data:LoginInput,meta:SessionMeta){
  if(!data.email || !data.password){
    throw new Error("Please provide the email and password")
  }
  const email=data.email.trim().toLowerCase()
  const user=await authRepo.findUserByEmail(email)
  if(!user){
    throw new Error("Invalid email or password")
  }
  const isPasswordCorrect=await comparePassword(data.password,user.passwordHash)
  if(!isPasswordCorrect){
    throw new Error("Invalid email or password")
  }
  if(!user.isActive){
    throw new Error("Accont is disabled")
  }
  const accessToken=signToken({sub:user.id,email:user.email})
  const refreshToken=await createRefreshToken(user.id,meta)
  return {
    user:{
      id:user.id,
      name:user.name,
      email:user.email,
      isActive:user.isActive,
      createdAt:user.createdAt,
      updatedAt:user.updatedAt
    },
    accessToken,
    refreshToken
  }
}

export async function refresh(oldRefreshToken:string|undefined,meta:SessionMeta){
  if(!oldRefreshToken){
    throw new Error("Refresh token missing")
  }
  const session=await authRepo.findSessionByTokenHash(hashToken(oldRefreshToken))
  if(!session){
    throw new Error("Invalid refresh token")
  }

  // Delete the old token first. If another request already used it, nothing is deleted and we reject.
  const deleted=await authRepo.deleteSession(session.id)
  if(deleted.count===0){
    throw new Error("Invalid refresh token")
  }
  if(session.expiredAt<new Date()){
    throw new Error("Refresh token expired")
  }
  if(!session.user.isActive){
    throw new Error("Accont is disabled")
  }

  const accessToken=signToken({sub:session.user.id,email:session.user.email})
  const refreshToken=await createRefreshToken(session.user.id,meta)
  return {accessToken,refreshToken}
}

export async function logout(refreshToken:string|undefined){
  if(!refreshToken) return
  const session=await authRepo.findSessionByTokenHash(hashToken(refreshToken))
  if(session){
    await authRepo.deleteSession(session.id)
  }
}
