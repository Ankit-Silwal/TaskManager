import client from "prom-client"
import type { Request,Response,NextFunction } from "express"

export const register=new client.Registry();

client.collectDefaultMetrics({register});

const httpDuration=new client.Histogram({
  name:"http_request_duration_seconds",
  help:"How long HTTP request takes",
  labelNames:["method","route","status"] as const,
  buckets:[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5],
  registers:[register]
})

export const cacheLookups=new client.Counter({
  name:"task_cache_lookups_total",
  help:"Task cache lookups",
  labelNames:["result"] as const,
  registers:[register]
})

export function metricsMiddleware(req:Request,res:Response,next:NextFunction){
  const end=httpDuration.startTimer();
  res.on("finish",()=>{
    const route=req.route?req.baseUrl+req.path:"unmatched"
    end({method:req.method,route,status:String(res.statusCode)})
  })
  next();
}

export async function metricsController(_req:Request,res:Response){
  res.setHeader("Content-Type",register.contentType);
  res.send(await register.metrics());
}