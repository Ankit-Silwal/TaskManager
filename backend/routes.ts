import type { Application } from "express";
import { authRoutes } from "./src/routes/auth.routes.js";

export function setUpRoutes(app:Application){
  app.use("/api/auth",authRoutes);  
}