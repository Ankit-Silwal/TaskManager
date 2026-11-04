import "dotenv/config"
import {prisma} from "./src/config/prisma.js"
import {cleanUpExpiredSession} from "./src/jobs/cleanUpSessions.js";
import { sign } from "node:crypto";
const INTERVAL_MS=Number(process.env.CLEANUP_INTERVAL??10*60*1000);
let running=false;
let stopping=false;

async function runCleanUp(){
  if(running || stopping) return;
  running=true;
  const start=Date.now()
  try{
    const deleted=await cleanUpExpiredSession()
    console.log(`cleanup:delted ${deleted} session in ${Date.now()-start} ms`)
  }catch(err){
    console.error("Cleanup failed:",err instanceof Error?err.message:err)
  }finally{
    running=false;
  }
}
console.log(`Woker started ,cleanup every ${INTERVAL_MS/1000}s`)
runCleanUp();
const timer=setInterval(runCleanUp,INTERVAL_MS);
async function shutdown(signal:string){
  if(stopping) return;
  stopping=true;
  console.log(`${sign} received,worker stopping`)
  clearInterval(timer);
  const deadline=Date.now()+8000;
  while(running && Date.now()<deadline){
    await new Promise(r=>setTimeout(r,100));
  }
  await prisma.$disconnect().catch(()=>{})
  process.exit();
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));