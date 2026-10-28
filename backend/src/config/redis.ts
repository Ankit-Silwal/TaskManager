import "dotenv/config"
import { createClient } from "redis";


export const redis=process.env.REDIS_URL?createClient({
  url:process.env.REDIS_URL,
  
}):null

redis?.on("error",(err)=>{
  console.error("Redis error",err.message)
})

export function connectRedis(){
  if(!redis || redis.isOpen) return;
  redis.connect()
    .then(()=>console.log("Connected to the redis"))
    .catch((err)=>console.error("Could not connect to Redis",err.message))
}