import { authRepo } from "../repositories/auth.repo.js";

const BATCH_SIZE=1000;
export async function cleanUpExpiredSession(){
  let total=0;
  while(true){
    const deleted=await authRepo.deleteExpiredSessionBatch(BATCH_SIZE)
    total+=deleted
    if(deleted<BATCH_SIZE){
      break;
    }
  }
  return total;
}