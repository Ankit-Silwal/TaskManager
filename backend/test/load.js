// k6 load test for the task API. Run with SCENARIO=limiter or SCENARIO=capacity.
//   k6 run -e SCENARIO=limiter  test/load.js
//   k6 run -e SCENARIO=capacity test/load.js
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE=__ENV.BASE_URL||"http://localhost:8000";
const tokens=JSON.parse(open("./tokens.json"));
const ok200=new Counter("status_2xx");
const limited429=new Counter("status_429");
const serverErr=new Counter("status_5xx");

const scenarios={
  // 5 users each send 120 sequential requests against a limit of 100 / 5 min.
  // Expect exactly 100 x 200 and 20 x 429 per user (500 / 100 in total).
  limiter:{
    executor:"per-vu-iterations",vus:5,iterations:120,maxDuration:"2m"
  },
  // Open model: fixed arrival rate that steps up, spread across all other users.
  capacity:{
    executor:"ramping-arrival-rate",startRate:50,timeUnit:"1s",
    preAllocatedVUs:200,maxVUs:1000,
    stages:[
      {target:100,duration:"20s"},{target:100,duration:"30s"},
      {target:300,duration:"20s"},{target:300,duration:"30s"},
      {target:600,duration:"20s"},{target:600,duration:"30s"},
      {target:1000,duration:"20s"},{target:1000,duration:"30s"},
    ]
  }
};

export const options={
  scenarios:{[__ENV.SCENARIO||"limiter"]:scenarios[__ENV.SCENARIO||"limiter"]},
  summaryTrendStats:["avg","min","med","p(90)","p(95)","p(99)","max"],
};

function record(res){
  if(res.status>=200&&res.status<300) ok200.add(1);
  else if(res.status===429) limited429.add(1);
  else if(res.status>=500) serverErr.add(1);
}

export default function(){
  if(__ENV.SCENARIO==="capacity"){
    // users 0-4 are reserved for the limiter scenario
    const token=tokens[5+Math.floor(Math.random()*(tokens.length-5))];
    const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
    let res;
    if(Math.random()<0.85){
      res=http.get(`${BASE}/api/tasks`,{headers,tags:{name:"GET /api/tasks"}});
    }else{
      res=http.post(`${BASE}/api/tasks`,JSON.stringify({title:"load task",priority:"HIGH"}),
        {headers,tags:{name:"POST /api/tasks"}});
    }
    record(res);
    check(res,{"2xx or 429":r=>(r.status>=200&&r.status<300)||r.status===429});
  }else{
    const token=tokens[(__VU-1)%5];
    const res=http.get(`${BASE}/api/tasks`,{headers:{Authorization:`Bearer ${token}`}});
    record(res);
    check(res,{"has RateLimit headers":r=>r.headers["Ratelimit-Limit"]!==undefined});
  }
}
