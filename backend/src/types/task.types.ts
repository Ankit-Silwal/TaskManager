import type { TaskPriority, TaskStatus } from "../generated/prisma/enums.js";

export interface CreateTaskInput{
  title:string,
  description:string|null,
  status:TaskStatus,
  priority:TaskPriority,
  dueDate:Date|null
}

export interface UpdateTaskInput{
  title?:string,
  description?:string|null,
  status?:TaskStatus,
  priority?:TaskPriority,
  dueDate?:Date|null
}
