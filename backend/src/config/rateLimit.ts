import { createRateLimiter } from "../middleware/ratelimit.middleware.js";
import { byIp,byIpandEmail,byUser } from "../utills/rateLimitKeys.js";

export const loginRateLimiter=createRateLimiter({
  name:"login",
  windowMs:5*60*1000,
  max:10,
  keyGenerator:byIp
})

export const registerLimiter=createRateLimiter({
  name:"register",
  windowMs:5*60*100,
  max:10,
  keyGenerator:byIp
})

export const refreshLimiter=createRateLimiter({
  name:"refresh",
  windowMs:15*60*1000,
  max:60,
  keyGenerator:byIp
})

export const taskLimiter=createRateLimiter({
  name:"tasks",
  windowMs:5*60*1000,
  max:100,
  keyGenerator:byUser
})