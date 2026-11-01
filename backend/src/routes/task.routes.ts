import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  createTaskController,
  deleteTaskController,
  getTaskController,
  getTaskCountsController,
  getTasksController,
  updateTaskController
} from "../controllers/task.controller.js";
import { taskLimiter } from "../config/rateLimit.js";

export const taskRoutes=Router();

taskRoutes.use(authMiddleware);
taskRoutes.use(taskLimiter)
taskRoutes.get("/",getTasksController);
// Must come before "/:id", or Express would treat "counts" as a task id.
taskRoutes.get("/counts",getTaskCountsController);
taskRoutes.get("/:id",getTaskController);
taskRoutes.post("/",createTaskController);
taskRoutes.patch("/:id",updateTaskController);
taskRoutes.delete("/:id",deleteTaskController);
