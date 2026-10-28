// Load .env before app.js is imported, so every module sees the variables when it first runs.
import "dotenv/config";
import app from "./app.js";
import { connectRedis } from "./src/config/redis.js";
const port=process.env.PORT||8000;
connectRedis();
app.listen(port,()=>{
  console.log(`The server is running at port no ${port}`)
})
