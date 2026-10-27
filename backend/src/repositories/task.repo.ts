import {prisma} from "../config/prisma.js"
import type { TaskPriority, TaskStatus } from "../generated/prisma/enums.js"

export const taskRepo={
  findAllByUser(userId:string,status?:TaskStatus){
    return prisma.task.findMany({
      where:status?{userId,status}:{userId},
      orderBy:{createdAt:"desc"}
    })
  },
  findByIdForUser(id:string,userId:string){
    return prisma.task.findFirst({where:{id,userId}})
  },
  create(data:{
    userId:string,
    title:string,
    description:string|null,
    status:TaskStatus,
    priority:TaskPriority,
    dueDate:Date|null,
    completedAt:Date|null
  }){
    return prisma.task.create({data})
  },
  update(id:string,data:{
    title?:string,
    description?:string|null,
    status?:TaskStatus,
    priority?:TaskPriority,
    dueDate?:Date|null,
    completedAt?:Date|null
  }){
    return prisma.task.update({where:{id},data})
  },
  delete(id:string){
    return prisma.task.delete({where:{id}})
  }
}
