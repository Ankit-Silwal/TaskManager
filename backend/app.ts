import express from "express"
import cors from "cors";
import cookieparser from "cookie-parser";
import { setUpRoutes } from "./routes.js";
const app=express();
app.use(cors({
  origin:process.env.CLIENT_ORIGIN??"http://localhost:3000",
  credentials:true,
  exposedHeaders:["RateLimit-limit","RateLimit-Remaining","RateLimit-Reset","Retry-Afters"]
}));
app.use(express.json());
app.use(cookieparser());
setUpRoutes(app);


export default app;
