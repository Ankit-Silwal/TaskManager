export interface RateLimitStore{
  increment(key:string,windowMs:number):Promise<{count:number,resetAt:number}>
}

export class MemoryStore implements RateLimitStore{
  private hits=new Map<String,{count:number,resetAt:number}>()
  constructor(){
    //clearing the expired key to reduct the map size
    setInterval(()=>{
      const now=Date.now()
      for(const [key,entry] of this.hits){
        if(entry.resetAt<=now) this.hits.delete(key)
      }
    },60_000).unref()
  }
  async increment(key:string,windowMs:number){
    const now=Date.now()
    const entry=this.hits.get(key)
    if(!entry || entry.resetAt<=now){
      const fresh={count:1,resetAt:now+windowMs}
      this.hits.set(key,fresh)
      return fresh;
    }
    entry.count++;
    return entry;
  }
}

const INCREMENT_SCRIPT=`
local count=redis.call("INCR",KEYS[1])
if count==1 or redis.call("PTTL",KEYS[1])<0 then 
  redis.call("PEXPIRE",KEYS[1],ARGV[1])
end
return {count,redis.call("PTTL",KEYS[1])}
`

interface EvalClient{
  eval(script:string,options:{
    keys:string[],
    arguments:string[]
  }):Promise<unknown>
}
export class RedisStore implements RateLimitStore{
  constructor(private readonly client:EvalClient,private readonly prefix="ratelimit:"){}

  async increment(key:string,windowMs:number){
    const [count,ttlMs]=await this.client.eval(INCREMENT_SCRIPT,{
      keys:[this.prefix+key],
      arguments:[String(windowMs)]
    }) as [number,number]
    return {count,resetAt:Date.now()+ttlMs}
  }
}