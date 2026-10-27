import type { Request,Response } from "express";
import {
  createTask,
  deleteTask,
  getTask,
  getTasks,
  parseCreateTask,
  parseStatusFilter,
  parseUpdateTask,
  updateTask
} from "../services/task.services.js";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BAD_REQUEST_PREFIXES=[
  "Title ",
  "Description ",
  "Status must",
  "Priority must",
  "Due date",
  "Nothing to update"
]

function handleError(err:unknown,res:Response){
  const message=err instanceof Error?err.message:"Something went wrong"
  if(message==="Task not found"){
    return res.status(404).json({message})
  }
  if(BAD_REQUEST_PREFIXES.some(prefix=>message.startsWith(prefix))){
    return res.status(400).json({message})
  }
  console.error(err)
  return res.status(500).json({message:"Internal server error"})
}

// A malformed id would make Postgres throw on the uuid column, so treat it as not found.
function taskIdParam(req:Request):string{
  const id=req.params.id
  if(typeof id!=="string" || !UUID_RE.test(id)){
    throw new Error("Task not found")
  }
  return id
}

export async function getTasksController(req:Request,res:Response){
  try{
    const status=parseStatusFilter(req.query.status)
    const tasks=await getTasks(req.user!.sub,status)
    return res.status(200).json({tasks})
  }catch(err){
    return handleError(err,res)
  }
}

export async function getTaskController(req:Request,res:Response){
  try{
    const task=await getTask(req.user!.sub,taskIdParam(req))
    return res.status(200).json({task})
  }catch(err){
    return handleError(err,res)
  }
}

export async function createTaskController(req:Request,res:Response){
  try{
    const task=await createTask(req.user!.sub,parseCreateTask(req.body))
    return res.status(201).json({task})
  }catch(err){
    return handleError(err,res)
  }
}

export async function updateTaskController(req:Request,res:Response){
  try{
    const task=await updateTask(req.user!.sub,taskIdParam(req),parseUpdateTask(req.body))
    return res.status(200).json({task})
  }catch(err){
    return handleError(err,res)
  }
}

export async function deleteTaskController(req:Request,res:Response){
  try{
    await deleteTask(req.user!.sub,taskIdParam(req))
    return res.status(204).end()
  }catch(err){
    return handleError(err,res)
  }
}
