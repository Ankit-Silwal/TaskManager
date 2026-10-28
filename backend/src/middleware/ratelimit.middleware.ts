import type { Request,Response,NextFunction } from "express";
import { MemoryStore,RedisStore,type RateLimitStore } from "../utills/rateLimitStore.js";
import { redis } from "../config/redis.js";

interface RateLimitOptions{
  name:string,
  windowMs:number,
  max:number,
  keyGenerator:(req:Request)=>string
  message?:string,
  store?:RateLimitStore
}

const defaultStore:RateLimitStore=redis?new RedisStore(redis):new MemoryStore();

export function createRateLimiter(options:RateLimitOptions){
  const store=options.store??defaultStore
  const message=options.message??"Too many requests.Please try again later."
  return async function rateLimiter(req:Request,res:Response,next:NextFunction){
    try{
      const key=`${options.name}:${options.keyGenerator(req)}`
      const {count,resetAt}=await store.increment(key,options.windowMs)
      const retryAfterSec=Math.max(1,Math.ceil(resetAt-Date.now())/1000);
      
      res.setHeader("RateLimit-Limit",options.max);
      res.setHeader("RateLimit-Remaining",Math.max(0,options.max-count))
      res.setHeader("RateLimit-Reset",retryAfterSec)
      if(count>options.max){
        res.setHeader("Retry-After",retryAfterSec)
        return res.status(429).json({message})
      }
    }catch(err){
      console.error("Rate limiter error",err);
    }
    next();
  }
}