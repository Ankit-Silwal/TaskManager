# Load test results

Tests: `backend/test/` (`seed.ts`, `load.js`, `cleanup.ts`). Raw k6 output: `k6-limiter.txt`, `k6-capacity.txt/.json`, `k6-stress.txt/.json`, `k6-stress-fine.txt/.json`, CPU samples in `cpu-stress-fine.csv`.

## Architecture / versions tested

| Part | Version / setup |
|---|---|
| Runtime | Node 24.11.0, run with `tsx index.ts` (not a compiled build) |
| Web framework | Express 5.3, one process (no cluster, no load balancer) |
| ORM / driver | Prisma 7.10 + `@prisma/adapter-pg`, `pg` 8.23 (default pool, about 10 connections) |
| Database | PostgreSQL 18.1, local, same machine |
| Auth | Stateless JWT access tokens (15 min). Tokens were signed directly by `seed.ts`, so `/login` and `/register` were not exercised |
| Rate limiter | Fixed window counter, `MemoryStore` (in-process). Redis was **not** used (see below) |
| Task limiter | 100 requests / 5 min per user (`byUser`), after `authMiddleware` |
| Load tool | k6 v2.3.0, run on the **same machine** as the server and the database |
| Hardware | AMD Ryzen 7 7445HS, 12 logical cores, 15.3 GB RAM, Windows 11 |
| Data | 1000 users, 5 tasks each (5000 rows); the test then adds tasks via POST |

## Test 1: does the limiter limit? (`SCENARIO=limiter`)

5 users, 120 sequential `GET /api/tasks` each, against a limit of 100.

| Expected | Result |
|---|---|
| 500 x 2xx, 100 x 429 | **500 x 2xx, 100 x 429** |
| `RateLimit-*` headers present | 600 / 600 checks passed |

The counting is exact: 100 allowed per user, then 429.

## Test 2: how much load does it handle? (`SCENARIO=capacity`)

Open model (fixed arrival rate), random users from 995 accounts. Mix: 85% `GET /api/tasks`, 15% `POST /api/tasks`. Rate stepped 100, 300, 600, 1000 req/s (20 s ramp + 30 s hold each), 3 min 20 s in total.

| Metric | Value |
|---|---|
| Requests | 90,111 (about 450 / s average over the whole run) |
| Peak target rate held | 1000 req/s |
| Dropped iterations (k6 could not start them in time) | 386 (0.4%) |
| 2xx | 89,231 |
| 429 | 880 (users who passed 100 requests; the limiter working as intended) |
| 5xx / other errors | 0 |
| Latency avg / median | 12.2 ms / 1.5 ms |
| Latency p90 / p95 / p99 | 9.4 ms / 44.8 ms / 318 ms |
| Latency max | 447 ms |

## Test 3: where does it break? (`SCENARIO=stress`)

Same mix (85% GET / 15% POST), but 20,000 seeded users (100,000 tasks), so the per-user limiter never turns the top rates into cheap 429s. Rate steps up every 40 s (10 s ramp + 30 s hold); k6 may use up to 3000 VUs. Two runs.

**Run A, coarse steps** (`k6-stress.txt`): the first two segments already show the break.

| Target rate | Actual req/s | p95 latency | Verdict |
|---|---|---|---|
| 1000 | about 940 | 33 ms | OK |
| 2000 | about 1,150 | 3.1 s | **saturated** |
| 3000 to 8000 | about 940 to 1,550 (queued) | 3 to 5 s | saturated, 652k iterations dropped |

**Run B, fine steps** (`k6-stress-fine.txt`, RATES=1000,1200,1400,1600,1800):

| Target rate | Requests in segment | p95 | p99 | Errors | Verdict |
|---|---|---|---|---|---|
| 1000 req/s | 37,485 | 12 ms | 115 ms | 0 | OK |
| 1200 req/s | 46,997 | 4.3 ms | 12 ms | 0 | OK |
| 1400 req/s | 54,997 | 25 ms | 281 ms | 0 | OK, tail starts growing |
| 1600 req/s | 51,432 | **2.74 s** | 2.76 s | 0 | **saturated** |
| 1800 req/s | 57,133 | **2.61 s** | 2.89 s | 0 | saturated |

**The ceiling on this setup is about 1,400 req/s** (mixed read/write). Beyond roughly 1,500 the server cannot keep up: requests queue, p95 jumps from tens of milliseconds to about 2.5 s, and k6 starts dropping iterations (25,432 in run B). Even when overloaded the server returned **0 errors** (no 5xx, no timeouts); it just got slow.

**Likely bottleneck: the single Node event loop.** During run B the `node` process used about 7 to 10% of the whole machine (`results/cpu-stress-fine.csv`), which on 12 logical cores is about 1 core, i.e. a fully used single thread. k6 used about 4 to 6%. Postgres CPU could not be read (the sampler reported 0, so ignore it). Nothing in this data points to the database as the limit, but it was not proven either.

## What this tells us

- A single Node process with the in-memory limiter sustained **about 1000 req/s** for this read-heavy mix with zero server errors. Test 3 below pushes past that to find the actual ceiling.
- The median stays low, but **p95 and p99 grow** under load (p99 about 318 ms at 1000 req/s, about 281 ms at 1400), so the tail is where the strain first shows, right before the cliff.
- Past about 1,400 to 1,500 req/s the latency does not degrade gradually, it **falls off a cliff** (tens of ms to about 2.5 s). Run one Node process per core (PM2 cluster or containers behind a load balancer) to move that ceiling; the stateless JWT auth allows this, but the in-memory limiter then needs Redis, or each instance gets its own counters.
- 429s only hit users who went over their own limit. The limiter did not slow other users.

## Limits of this test (read before trusting the numbers)

- **k6, the server and Postgres shared one machine**, so they competed for CPU. Real capacity on separate machines is likely higher, but network latency would add to every request.
- **Redis was not tested.** Docker was not running and no Redis server was installed, so the `RedisStore` path (network hop per request, atomic Lua script) is unmeasured. Expect higher per-request latency than `MemoryStore`.
- The ceiling (about 1,400 req/s) is for this machine, this mix and a task list of about 5 rows per user. It will be lower with bigger lists or heavier queries.
- `GET /api/tasks` is **not paginated**. Tasks accumulate during the run (15% of requests are POSTs), so list responses grow. This is the likely first bottleneck at larger data sizes (305 MB received here).
- Login and register were not load tested. bcrypt (12 rounds) is CPU-heavy and will be far slower per request than the task routes.
- The run used `tsx`, not a built app, and one run per scenario, so there is no variance data.

## Things noticed in the code while testing (not changed)

- `config/rateLimit.ts`: `registerLimiter` uses `windowMs: 5*60*100` (30 s), probably meant `5*60*1000`.
- `ratelimit.middleware.ts`: `Math.ceil(resetAt-Date.now())/1000` applies `ceil` before the division, so `Retry-After` / `RateLimit-Reset` can be fractional. It should be `Math.ceil((resetAt-Date.now())/1000)`.
- `redis.ts`: no `disableOfflineQueue`. With `REDIS_URL` set and Redis down, commands queue and requests can hang instead of falling through. Not tested here.
- `app.ts`: `exposedHeaders` has typos (`"Retry-Afters"`, `"RateLimit-limit"`), so browsers can't read `Retry-After`.

## Re-run

```bash
cd backend
npx tsx test/seed.ts 1000            # create users and tokens (valid 15 min); use 20000 for the stress scenario
REDIS_URL= npx tsx index.ts          # in another terminal; empty REDIS_URL = in-memory limiter
k6 run -e SCENARIO=limiter  test/load.js
k6 run -e SCENARIO=capacity test/load.js
k6 run -e SCENARIO=stress -e RATES=1000,1200,1400,1600,1800 test/load.js
npx tsx test/cleanup.ts              # remove the test users
```
Restart the server between the two scenarios if you re-run, or the in-memory counters carry over.
