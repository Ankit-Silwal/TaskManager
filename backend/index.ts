// Load .env before app.js is imported, so every module sees the variables when it first runs.
import "dotenv/config";
import app from "./app.js";
import { connectRedis } from "./src/config/redis.js";
import {redis} from "./src/config/redis.js"
import {prisma} from "./src/config/prisma.js"
import { lifecycle } from "./src/config/lifecycle.js";

const port=process.env.PORT||8000;
connectRedis();
const server=app.listen(port,()=>{
  console.log(`The server is running at port no ${port}`)
})

//default value of timeout is 5 section but it need to be more than nginx 
server.keepAliveTimeout=65000;
server.headersTimeout=66000;

function shutdown(signal:string){
  if(lifecycle.shuttingDown) return;
  // also makes /health answer 503 from now on
  lifecycle.shuttingDown=true;
  console.log(`${signal} received,shutting down`);
  setTimeout(()=>{
    console.error("Shutdown took too long,forcing exit")
    process.exit(1);
  },8000).unref()
  server.close(async(err)=>{
    await prisma.$disconnect().catch(()=>{})
    if(redis?.isOpen) await redis.quit().catch(()=>{})
    process.exit(err?1:0);
  })
  server.closeIdleConnections();
}
process.on("SIGTERM",()=>shutdown("SIGTERM")) //docker stop
process.on("SIGINT",()=>shutdown("SIGINT"));
