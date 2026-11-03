import {redis} from "../config/redis.js"

const TTL_SECONDS=60;
// Kill switch: TASK_CACHE=off turns the cache off without a code change (used to load test with and without it).
const CACHE_ENABLED=process.env.TASK_CACHE!=="off"

function userKey(userId:string){
  return `taskCache:${userId}`
}

// The Redis client when the cache can be used, otherwise null (cache off, no REDIS_URL, or not connected).
// Returning the client (instead of true/false) lets TypeScript know it is not null after the check.
function cacheClient(){
  return CACHE_ENABLED && redis?.isReady ? redis : null
}

export async function getCached<T>(userId:string,field:string):Promise<T|null> {
  const client=cacheClient()
  if(!client) return null;
  try{
    const json=await client.hGet(userKey(userId),field)
    return json?JSON.parse(json) as T:null
  }catch(err){
    console.error("Cache read failed",err);
    return null;
  }
}

export async function setCached(userId:string,field:string,value:unknown) {
  const client=cacheClient()
  if(!client) return;
  try{
    await client.multi()
      .hSet(userKey(userId),field,JSON.stringify(value))
      .expire(userKey(userId),TTL_SECONDS)
      .exec()
  }catch(err){
    console.error("Cache write failed",err);
  }
}

export async function invalidateUser(userId:string){
  const client=cacheClient()
  if(!client) return
  try{
    await client.del(userKey(userId))
  }catch(err){
    console.error("Cache invalidate failed",err);
  }
}
