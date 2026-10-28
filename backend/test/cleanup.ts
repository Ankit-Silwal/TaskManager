// Removes everything seed.ts and the load test created (tasks/sessions cascade).
// Usage: npx tsx test/cleanup.ts
import { rmSync } from "node:fs";
import { prisma } from "../src/config/prisma.js";

const {count}=await prisma.user.deleteMany({where:{email:{startsWith:"loadtest-"}}});
rmSync(new URL("./tokens.json",import.meta.url),{force:true});
console.log(`Deleted ${count} load-test users (and their tasks)`);
await prisma.$disconnect();
