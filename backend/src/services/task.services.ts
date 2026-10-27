import { taskRepo } from "../repositories/task.repo.js";
import { TaskPriority, TaskStatus } from "../generated/prisma/enums.js";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task.types.js";

const STATUSES=Object.values(TaskStatus) as string[]
const PRIORITIES=Object.values(TaskPriority) as string[]

function parseTitle(value:unknown):string{
  if(typeof value!=="string" || !value.trim()){
    throw new Error("Title is required")
  }
  if(value.trim().length>200){
    throw new Error("Title must be 200 characters or less")
  }
  return value.trim()
}

function parseDescription(value:unknown):string|null{
  if(value===undefined || value===null || value==="") return null
  if(typeof value!=="string"){
    throw new Error("Description must be text")
  }
  return value.trim()||null
}

function parseStatus(value:unknown):TaskStatus{
  if(typeof value!=="string" || !STATUSES.includes(value)){
    throw new Error("Status must be one of "+STATUSES.join(", "))
  }
  return value as TaskStatus
}

function parsePriority(value:unknown):TaskPriority{
  if(typeof value!=="string" || !PRIORITIES.includes(value)){
    throw new Error("Priority must be one of "+PRIORITIES.join(", "))
  }
  return value as TaskPriority
}

function parseDueDate(value:unknown):Date|null{
  if(value===undefined || value===null || value==="") return null
  if(typeof value!=="string"){
    throw new Error("Due date must be a date string")
  }
  const date=new Date(value)
  if(Number.isNaN(date.getTime())){
    throw new Error("Due date is invalid")
  }
  return date
}

export function parseCreateTask(body:unknown):CreateTaskInput{
  const b=(body??{}) as Record<string,unknown>
  return {
    title:parseTitle(b.title),
    description:parseDescription(b.description),
    status:b.status===undefined?TaskStatus.TODO:parseStatus(b.status),
    priority:b.priority===undefined?TaskPriority.MEDIUM:parsePriority(b.priority),
    dueDate:parseDueDate(b.dueDate)
  }
}

export function parseUpdateTask(body:unknown):UpdateTaskInput{
  const b=(body??{}) as Record<string,unknown>
  const data:UpdateTaskInput={}
  if(b.title!==undefined) data.title=parseTitle(b.title)
  if(b.description!==undefined) data.description=parseDescription(b.description)
  if(b.status!==undefined) data.status=parseStatus(b.status)
  if(b.priority!==undefined) data.priority=parsePriority(b.priority)
  if(b.dueDate!==undefined) data.dueDate=parseDueDate(b.dueDate)
  if(Object.keys(data).length===0){
    throw new Error("Nothing to update")
  }
  return data
}

export function parseStatusFilter(value:unknown):TaskStatus|undefined{
  if(value===undefined || value==="") return undefined
  return parseStatus(value)
}

export async function getTasks(userId:string,status?:TaskStatus){
  return taskRepo.findAllByUser(userId,status)
}

export async function getTask(userId:string,taskId:string){
  const task=await taskRepo.findByIdForUser(taskId,userId)
  if(!task){
    throw new Error("Task not found")
  }
  return task
}

export async function createTask(userId:string,input:CreateTaskInput){
  return taskRepo.create({
    userId,
    ...input,
    completedAt:input.status===TaskStatus.DONE?new Date():null
  })
}

export async function updateTask(userId:string,taskId:string,input:UpdateTaskInput){
  const existing=await getTask(userId,taskId)

  // Keep completedAt in sync with status: set it when the task becomes DONE, clear it when reopened.
  if(input.status!==undefined && input.status!==existing.status){
    return taskRepo.update(existing.id,{
      ...input,
      completedAt:input.status===TaskStatus.DONE?new Date():null
    })
  }
  return taskRepo.update(existing.id,input)
}

export async function deleteTask(userId:string,taskId:string){
  const existing=await getTask(userId,taskId)
  await taskRepo.delete(existing.id)
}
