import type { Request,Response } from "express";
import { register,login,refresh,logout } from "../services/auth.service.js";
import type { SessionMeta } from "../types/auth.types.js";
import { REFRESH_TTL_MS } from "../utills/token.js";

const REFRESH_COOKIE="refreshToken"
const COOKIE_PATH="/api/auth"

function sessionMeta(req:Request):SessionMeta{
  return {
    userAgent:req.headers["user-agent"]??null,
    ipAddress:req.ip??null
  }
}

function setRefreshCookie(res:Response,token:string){
  res.cookie(REFRESH_COOKIE,token,{
    httpOnly:true,
    secure:process.env.NODE_ENV==="production",
    sameSite:"lax",
    path:COOKIE_PATH,
    maxAge:REFRESH_TTL_MS
  })
}

function clearRefreshCookie(res:Response){
  res.clearCookie(REFRESH_COOKIE,{path:COOKIE_PATH})
}

export async function registerController(req:Request,res:Response){
  try{
    const {name,email,password}=req.body??{};
    const result=await register({name,email,password},sessionMeta(req));
    setRefreshCookie(res,result.refreshToken)
    return res.status(201).json({
      message:"User registered successfully",
      user:result.user,
      accessToken:result.accessToken
    })
  }catch(err){
    const message=err instanceof Error?err.message:"Something went wrong"
    if (message === "Please provide name,email and password") {
      return res.status(400).json({ message });
    }
    if (message === "Email is already registered") {
      return res.status(409).json({ message });
    }

    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
    
  }
}

export async function loginController(req:Request,res:Response){
  try{
    const {email,password}=req.body??{};
    const result=await login({email,password},sessionMeta(req));
    setRefreshCookie(res,result.refreshToken)
    return res.status(200).json({
      message:"Logged in successfully",
      user:result.user,
      accessToken:result.accessToken
    })
  }catch(err){
    const message=err instanceof Error?err.message:"Something went wrong"
    if (message === "Please provide the email and password") {
      return res.status(400).json({ message });
    }
    if (message === "Invalid email or password") {
      return res.status(401).json({ message });
    }
    if (message === "Accont is disabled") {
      return res.status(403).json({ message });
    }

    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function refreshController(req:Request,res:Response){
  try{
    const result=await refresh(req.cookies?.[REFRESH_COOKIE],sessionMeta(req))
    setRefreshCookie(res,result.refreshToken)
    return res.status(200).json({accessToken:result.accessToken})
  }catch(err){
    const message=err instanceof Error?err.message:"Something went wrong"
    clearRefreshCookie(res)
    if (
      message === "Refresh token missing" ||
      message === "Invalid refresh token" ||
      message === "Refresh token expired"
    ) {
      return res.status(401).json({ message });
    }
    if (message === "Accont is disabled") {
      return res.status(403).json({ message });
    }

    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function logoutController(req:Request,res:Response){
  try{
    await logout(req.cookies?.[REFRESH_COOKIE])
    clearRefreshCookie(res)
    return res.status(204).end()
  }catch(err){
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
