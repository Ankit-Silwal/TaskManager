import type { Request } from "express";
export function byIp(req:Request){
  return req.ip??"unknown"
}

export function byIpandEmail(req:Request){
  const email=typeof req.body?.email=="string"?req.body.email.trim().toLowerCase():"no-email"
  return `${byIp(req)}:${email}`
}

export function byUser(req:Request){
  //can onlu be used after the middleware lik routes.use("/tasks",ByIp,authMiddleware,rateLimit);
  return req.user?.sub??byIp(req);
}