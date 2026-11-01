import { taskRepo } from "../repositories/task.repo.js";
import { TaskPriority, TaskStatus } from "../generated/prisma/enums.js";
import type { CreateTaskInput, UpdateTaskInput } from "../types/task.types.js";
import { getCached,setCached,invalidateUser } from "../cache/taskCache.js";
import type { Task } from "../generated/prisma/client.js";

// Note: a page read back from the cache has its dates as strings (JSON has no Date type).
// That is fine because it is only sent to the client as JSON again.
type TaskPage={tasks:Task[],nextCursor:string|null}

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

const DEFAULT_LIMIT=20
const MAX_LIMIT=100
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseLimit(value:unknown):number{
  if(value===undefined || value==="") return DEFAULT_LIMIT
  const limit=Number(value)
  if(!Number.isInteger(limit) || limit<1 || limit>MAX_LIMIT){
    throw new Error(`Limit must be a whole number from 1 to ${MAX_LIMIT}`)
  }
  return limit
}

export function parseCursor(value:unknown):string|undefined{
  if(value===undefined || value==="") return undefined
  if(typeof value!=="string" || !UUID_RE.test(value)){
    throw new Error("Cursor is invalid")
  }
  return value
}

export async function getTasks(userId:string,opts:{status?:TaskStatus|undefined,limit:number,cursor?:string|undefined}):Promise<TaskPage>{
  // Only the first page is cached. "Load more" pages (with a cursor) always go to the database.
  const field=`list:${opts.status??"ALL"}:${opts.limit}`
  if(!opts.cursor){
    const cached=await getCached<TaskPage>(userId,field)
    if(cached) return cached
  }

  const rows=await taskRepo.findPageByUser(userId,opts)

  // The repo fetched limit+1 rows. If the extra row came back, there is another page.
  const hasMore=rows.length>opts.limit
  const tasks=hasMore?rows.slice(0,opts.limit):rows
  const nextCursor=hasMore?tasks[tasks.length-1]!.id:null
  const page={tasks,nextCursor}

  if(!opts.cursor) await setCached(userId,field,page)
  return page
}

// Counts for the filter tabs. Statuses with no tasks are missing from groupBy, so start every status at 0.
export async function getTaskCounts(userId:string){
  const cached=await getCached<Record<TaskStatus,number>>(userId,"counts")
  if(cached) return cached

  const rows=await taskRepo.countByStatus(userId)
  const counts=Object.fromEntries(STATUSES.map(s=>[s,0])) as Record<TaskStatus,number>
  for(const row of rows){
    counts[row.status]=row._count._all
  }

  await setCached(userId,"counts",counts)
  return counts
}

export async function getTask(userId:string,taskId:string){
  const task=await taskRepo.findByIdForUser(taskId,userId)
  if(!task){
    throw new Error("Task not found")
  }
  return task
}

// Every write clears the user's cached pages and counts. Always AFTER the database write:
// clearing first would let a concurrent read put the old data straight back into the cache.
export async function createTask(userId:string,input:CreateTaskInput){
  const task=await taskRepo.create({
    userId,
    ...input,
    completedAt:input.status===TaskStatus.DONE?new Date():null
  })
  await invalidateUser(userId)
  return task
}

export async function updateTask(userId:string,taskId:string,input:UpdateTaskInput){
  const existing=await getTask(userId,taskId)

  // Keep completedAt in sync with status: set it when the task becomes DONE, clear it when reopened.
  const statusChanged=input.status!==undefined && input.status!==existing.status
  const updated=statusChanged
    ? await taskRepo.update(existing.id,{
        ...input,
        completedAt:input.status===TaskStatus.DONE?new Date():null
      })
    : await taskRepo.update(existing.id,input)

  await invalidateUser(userId)
  return updated
}

export async function deleteTask(userId:string,taskId:string){
  const existing=await getTask(userId,taskId)
  await taskRepo.delete(existing.id)
  await invalidateUser(userId)
}
