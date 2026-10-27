import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  createTaskController,
  deleteTaskController,
  getTaskController,
  getTasksController,
  updateTaskController
} from "../controllers/task.controller.js";

export const taskRoutes=Router();

taskRoutes.use(authMiddleware);

taskRoutes.get("/",getTasksController);
taskRoutes.get("/:id",getTaskController);
taskRoutes.post("/",createTaskController);
taskRoutes.patch("/:id",updateTaskController);
taskRoutes.delete("/:id",deleteTaskController);
