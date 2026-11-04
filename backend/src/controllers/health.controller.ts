import type { Request,Response } from "express";
import {prisma} from "../config/prisma.js"
import {redis} from "../config/redis.js"
import { lifecycle } from "../config/lifecycle.js";

const CHECK_TIMEOUT_MS=2000

type checkResult="ok"|"down"|"not_configured"

async function check(fn:()=>Promise<unknown>):Promise<checkResult>{
  let timer:NodeJS.Timeout|undefined
  const timeout=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error("timeout")),CHECK_TIMEOUT_MS)
  })
  try{
    await Promise.race([fn(),timeout])
    return "ok"
  }catch{
    return "down"
  }finally{
    clearTimeout(timer);
  }
}

export async function healthController(_req:Request,res:Response){
  res.setHeader("Cache-Control","no-store")
  if(lifecycle.shuttingDown){
    return res.status(503).json({status:"shutting_down"})
  }
  const client=redis
  const[database,cache]=await Promise.all([
    check(()=>prisma.$queryRaw`Select 1`),
    client?check(()=>client.ping()):Promise.resolve<checkResult>("not_configured")
  ])
  const healthy=database==="ok"
  return res.status(healthy?200:503).json({
    status:healthy?"ok":"unavailable",
    database,
    redis:cache
  })
}