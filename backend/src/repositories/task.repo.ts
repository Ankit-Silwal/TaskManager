import {prisma} from "../config/prisma.js"
import type { TaskPriority, TaskStatus } from "../generated/prisma/enums.js"

export const taskRepo={
  findPageByUser(userId:string,opts:{status?:TaskStatus|undefined,limit:number,cursor?:string|undefined}){
    const {status,limit,cursor}=opts
    return prisma.task.findMany({
      where:status?{userId,status}:{userId},
      orderBy:[{createdAt:"desc"},{id:"desc"}],
      take:limit+1,
      ...(cursor?{cursor:{id:cursor},skip:1}:{})
    })
  },
  // Number of tasks per status for one user, e.g. [{status:"DONE",_count:{_all:3}}, ...]
  countByStatus(userId:string){
    return prisma.task.groupBy({
      by:["status"],
      where:{userId},
      _count:{_all:true}
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
