// Creates load-test users + tasks directly in the DB and signs an access token for each,
// so the test skips /register and /login (bcrypt cost + their rate limits).
// Usage: npx tsx test/seed.ts [userCount]
import { writeFileSync } from "node:fs";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utills/hash.js";
import { signToken } from "../src/utills/jwt.js";

export const EMAIL_PREFIX="loadtest-";
const count=Number(process.argv[2]??1000);
const TASKS_PER_USER=5;

const passwordHash=await hashPassword("LoadTest123!"); // hashed once and shared

await prisma.user.deleteMany({where:{email:{startsWith:EMAIL_PREFIX}}});

await prisma.user.createMany({
  data:Array.from({length:count},(_,i)=>({
    name:`Load ${i}`,
    email:`${EMAIL_PREFIX}${i}@example.com`,
    passwordHash
  }))
});

const users=await prisma.user.findMany({
  where:{email:{startsWith:EMAIL_PREFIX}},
  select:{id:true,email:true},
  orderBy:{email:"asc"}
});

await prisma.task.createMany({
  data:users.flatMap(u=>Array.from({length:TASKS_PER_USER},(_,i)=>({
    userId:u.id,
    title:`Seed task ${i}`,
    description:"seeded for load test"
  })))
});

const tokens=users.map(u=>signToken({sub:u.id,email:u.email}));
writeFileSync(new URL("./tokens.json",import.meta.url),JSON.stringify(tokens));
console.log(`Seeded ${users.length} users, ${users.length*TASKS_PER_USER} tasks, tokens -> test/tokens.json (valid 15 min)`);
await prisma.$disconnect();
