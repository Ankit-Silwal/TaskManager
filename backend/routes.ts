import type { Application } from "express";
import { authRoutes } from "./src/routes/auth.routes.js";
import { taskRoutes } from "./src/routes/task.routes.js";
import { healthController } from "./src/controllers/health.controller.js";
import { metricsController } from "./src/metrics/metrics.js";
export function setUpRoutes(app:Application){
  // No auth and no rate limit: Docker calls this every few seconds.
  app.get("/health",healthController)
  app.get("/metrics",metricsController)
  app.use("/api/auth",authRoutes);
  app.use("/api/tasks",taskRoutes);

}
