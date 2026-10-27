import express from "express"
import cors from "cors";
import cookieparser from "cookie-parser";
import { setUpRoutes } from "./routes.js";
const app=express();
app.use(cors());
app.use(cookieparser());
setUpRoutes(app);


export default app;
