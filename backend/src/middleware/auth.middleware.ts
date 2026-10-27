import type { Request,Response,NextFunction } from "express";
import type { AccessTokenPayLoad } from "../types/auth.types.js";
import { verify } from "node:crypto";
import { verifyToken } from "../utills/jwt.js";

declare global{
  namespace Express{
    interface Request{
      user?:AccessTokenPayLoad
    }
  }
}

export function authMiddleware(req:Request,res:Response,next:NextFunction){
  const header=req.headers.authorization
  if(!header || !header.startsWith("Bearer ")){
    return res.status(401).json({message:"Access token missing"});
  }
  const token=header.split(" ")[1];
  if(!token){
    return res.status(401).json({message:"Access token missing"})
  }
  try{
    const payload=verifyToken(token);
    req.user=payload;
    next();
  }catch{
    return res.status(401).json({message:"Invalid or expired access token"})
  }
}