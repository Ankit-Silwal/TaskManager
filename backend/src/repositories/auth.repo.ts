import {prisma} from "../config/prisma.js"
import type { SessionMeta } from "../types/auth.types.js"

export const authRepo={
  findUserByEmail(email:string){
    return prisma.user.findUnique({where:{email}})
  },
  findUserById(id:string){
    return prisma.user.findUnique({where:{id}})
  },
  createUser(data:{
    name:string,
    email:string,
    passwordHash:string
  }){
    return prisma.user.create({data})
  },
  createSession(data:{
    userId:string,
    tokenHash:string,
    expiredAt:Date
  }&SessionMeta){
    return prisma.refreshSession.create({data})
  },
  findSessionByTokenHash(tokenHash:string){
    return prisma.refreshSession.findUnique({
      where:{tokenHash},
      include:{user:true}
    });
  },
  deleteSession(id:string){
    return prisma.refreshSession.deleteMany({where:{id}})
  }
}
