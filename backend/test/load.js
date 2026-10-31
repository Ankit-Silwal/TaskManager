// k6 load test for the task API. Run with SCENARIO=limiter or SCENARIO=capacity.
//   k6 run -e SCENARIO=limiter  test/load.js
//   k6 run -e SCENARIO=capacity test/load.js
import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { Counter } from "k6/metrics";

const BASE=__ENV.BASE_URL||"http://localhost:8000";
const tokens=new SharedArray("tokens",()=>JSON.parse(open("./tokens.json")));
const ok200=new Counter("status_2xx");
const limited429=new Counter("status_429");
const serverErr=new Counter("status_5xx");

const STRESS_RATES=(__ENV.RATES||"1000,2000,3000,4000,6000,8000").split(",").map(Number);
const SEGMENT_MS=40000;

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
  },
  // Find the ceiling: each 40 s segment (10 s ramp + 30 s hold) steps the rate up. Needs ~20k seeded users
  // so the per-user limiter does not turn the top rates into cheap 429s.
  stress:{
    executor:"ramping-arrival-rate",startRate:500,timeUnit:"1s",
    preAllocatedVUs:500,maxVUs:3000,
    stages:STRESS_RATES.flatMap(r=>[{target:r,duration:"10s"},{target:r,duration:"30s"}])
  }
};

export const options={
  scenarios:{[__ENV.SCENARIO||"limiter"]:scenarios[__ENV.SCENARIO||"limiter"]},
  // always-passing thresholds, only there so k6 prints per-segment numbers for the stress scenario
  thresholds:Object.fromEntries(STRESS_RATES.flatMap((r,i)=>[
    [`http_req_duration{seg:${i}}`,["max>=0"]],
    [`http_req_failed{seg:${i}}`,["rate>=0"]],
    [`http_reqs{seg:${i}}`,["count>=0"]],
  ])),
  summaryTrendStats:["avg","min","med","p(90)","p(95)","p(99)","max"],
};

function seg(){
  return String(Math.min(STRESS_RATES.length-1,Math.floor((Date.now()-exec.scenario.startTime)/SEGMENT_MS)));
}

function record(res){
  if(res.status>=200&&res.status<300) ok200.add(1);
  else if(res.status===429) limited429.add(1);
  else if(res.status>=500) serverErr.add(1);
}

export default function(){
  if(__ENV.SCENARIO==="capacity"||__ENV.SCENARIO==="stress"){
    // users 0-4 are reserved for the limiter scenario
    const token=tokens[5+Math.floor(Math.random()*(tokens.length-5))];
    const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
    let res;
    if(Math.random()<0.85){
      res=http.get(`${BASE}/api/tasks`,{headers,tags:{name:"GET /api/tasks",seg:seg()}});
    }else{
      res=http.post(`${BASE}/api/tasks`,JSON.stringify({title:"load task",priority:"HIGH"}),
        {headers,tags:{name:"POST /api/tasks",seg:seg()}});
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
