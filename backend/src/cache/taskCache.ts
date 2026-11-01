import {redis} from "../config/redis.js"

const TTL_SECONDS=60;
function userKey(userId:string){
  return `taskCache:${userId}`
}
export async function getCached<T>(userId:string,field:string):Promise<T|null> {
  if(!redis?.isReady) return null;
  try{
    const json=await redis.hGet(userKey(userId),field)
    return json?JSON.parse(json) as T:null
  }catch(err){
    console.error("Cache read failed",err);
    return null;
  }
}

export async function setCached(userId:string,field:string,value:unknown) {
  if(!redis?.isReady) return;
  try{
    await redis.multi()
      .hSet(userKey(userId),field,JSON.stringify(value))
      .expire(userKey(userId),TTL_SECONDS)
      .exec()
  }catch(err){
    console.error("Cache write failed",err);
  }
}

export async function invalidateUser(userId:string){
  if(!redis?.isReady) return
  try{
    await redis.del(userKey(userId))
  }catch(err){
    console.error("Cache invalidate failed",err);
  }
}