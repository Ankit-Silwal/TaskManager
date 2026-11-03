# Load test results

Tests: `backend/test/` (`seed.ts`, `load.js`, `cleanup.ts`). Raw k6 output: `k6-limiter.txt`, `k6-capacity.txt/.json`, `k6-stress.txt/.json`, `k6-stress-fine.txt/.json`, CPU samples in `cpu-stress-fine.csv`.

Tests 1 to 3 ran one Node process directly on Windows. **Test 4** (further down) runs the same API in Docker behind nginx and compares 1 backend with 4. Its raw output: `k6-docker-1backend.txt`, `k6-docker-4backend.txt`, `docker-stats-1backend.txt`, `docker-stats-4backend.txt`, `host-cpu-4backend.txt`.

**Test 5** adds cursor pagination and a Redis cache for the task list, and runs with the cache off and on. Raw output: `k6-paginated-nocache.txt`, `k6-paginated-cache.txt`, `docker-stats-paginated-nocache.txt`, `docker-stats-paginated-cache.txt`, `redis-commandstats-paginated.txt`.

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

## Test 4: horizontal scaling, 1 backend vs 4 backends behind nginx (2026-11-02)

The question: if one Node process is stuck on one CPU core, does running **4 copies** of the backend behind a load balancer raise the ceiling, and by how much?

### Setup

```
k6 (Windows) ──► localhost:8000 ──► nginx ──round-robin──► backend × N ──► Postgres
                                                                 └──────► Redis (shared rate-limit counters)
```

| Part | Version / setup |
|---|---|
| Everything except k6 | Docker Compose on Docker Desktop (WSL2), 12 CPUs and 7.9 GB RAM given to Docker |
| Load balancer | `nginx:1.27`, our `nginx/nginx.conf`: `worker_processes auto` (12 workers), `worker_connections 4096`, upstream `backend:8000` with `keepalive 32` |
| Backend | Same image as before (`tsx index.ts`), started with `docker compose up --scale backend=1` and then `--scale backend=4` |
| Rate limiter | **`RedisStore`** this time (`redis:7` container), so all backends share one counter. Express `trust proxy` = 1, so the limiter sees the client IP and not nginx's IP |
| Database | `postgres:18` container, default pool of about 10 connections per backend |
| Load | Same `stress` scenario: 85% `GET /api/tasks`, 15% `POST /api/tasks`, 20,000 seeded users (100,000 tasks), 40 s per step (10 s ramp + 30 s hold), k6 allowed up to 3000 VUs |
| Machine | Same laptop (Ryzen 7 7445HS, 12 logical cores), k6 running on Windows next to Docker |

Before the test we checked the setup by hand:
- `X-Instance` response header (container hostname) rotated across all 4 backends, so nginx was balancing.
- 12 failed logins in a row, spread over 4 backends, gave `RateLimit-Remaining` 9, 8, 7 ... 0 and then `429` on requests 11 and 12. Redis held one key, `ratelimit:login:172.18.0.1 = 12`. So the counter really is shared. With the old in-memory store each backend would count separately and the real limit would be 4 × 10.

### First attempt failed: nginx was the bottleneck, not the backend

The first 1-backend run used `events {}` with nothing inside, which means nginx defaults: **1 worker process, 512 connections**.

| Step (asked) | Requests failed |
|---|---|
| 800 req/s | 1.6% |
| 1200 req/s | 21.7% |
| 1600 req/s | 42.6% |
| 2000 req/s | 62.1% |
| 2400 req/s | 71.5% |

49% of all requests failed with `EOF` (connection closed, no response). The nginx log said `512 worker_connections are not enough` hundreds of times per second.

**Why:** every proxied request holds two connections (k6 → nginx and nginx → backend), so 512 connections is only about 256 requests in flight. k6 had up to 599 in flight. The official nginx image ships a config with `worker_processes auto;`, but we replaced the whole file and lost that line. curl tests (one request at a time) could never show this; only load does.

**Fix** in `nginx/nginx.conf`:
```nginx
worker_processes auto;      # one worker per CPU core (12 here)
events {
  worker_connections 4096;  # per worker
}
```
After this there were **0 failed requests** in both runs below.

### Results

Rates below are the requests finished in each 40 s step divided by 40. The "asked" rate is the average k6 targeted over the step, including its 10 s ramp.

**1 backend:**

| Asked | Done | p95 | p99 | Errors | Verdict |
|---|---|---|---|---|---|
| ~760 req/s | ~760 | 18 ms | 66 ms | 0 | OK |
| ~1150 req/s | ~1150 | 199 ms | 350 ms | 0 | OK, tail growing |
| ~1550 req/s | ~1390 | **2.45 s** | 2.62 s | 0 | **saturated** |
| ~1900 req/s | ~1320 | 2.72 s | 2.78 s | 0 | saturated |
| ~2300 req/s | ~1320 | 2.55 s | 2.68 s | 0 | saturated |

**4 backends:**

| Asked | Done | p95 | p99 | Errors | Verdict |
|---|---|---|---|---|---|
| ~940 req/s | ~940 | 32 ms | 180 ms | 0 | OK |
| ~1875 req/s | ~1875 | **52 ms** | 118 ms | 0 | OK (1 backend was already dead here) |
| ~2875 req/s | ~2320 | **2.94 s** | 4.17 s | 0 | **saturated** |
| ~3750 req/s | ~2360 | 4.59 s | 4.93 s | 0 | saturated |
| ~4625 req/s | ~2480 | 5.23 s | 5.74 s | 0 | saturated |

### Side by side

| | 1 backend | 4 backends |
|---|---|---|
| Ceiling (max finished req/s) | **~1,350** | **~2,400** |
| p95 at ~1,900 req/s | ~2.7 s (overloaded) | 52 ms |
| Errors when overloaded | 0 | 0 |
| Gain | | **~1.8×**, not 4× |

4 backends handle almost twice the traffic, and at ~1,900 req/s they are still fast while one backend is already drowning. Past the ceiling both behave the same way: no errors, requests just queue and p95 jumps to seconds (the "cliff" from Test 3).

### Why 1.8× and not 4×

CPU per container (`docker stats`, sampled every 20 s) and total Windows CPU (`host-cpu-4backend.txt`):

| | 1 backend run | 4 backends run (under overload) |
|---|---|---|
| Each backend | 100 to 113% (one full core) | 93 to 109% each (each one full core) |
| Postgres | 45 to 55% | **130 to 160%** |
| nginx | 30 to 40% | 90 to 135% |
| Redis | 3 to 10% | 13 to 20% |
| Whole laptop (Windows) | | **98 to 100%** |
| k6 itself | | about 1.25 cores |

1. **The laptop ran out of CPU.** In the 4-backend run Windows showed ~100% total CPU from the third step on. 4 backends (4 cores) + Postgres (~1.5) + nginx (~1) + k6 (~1.25) + Docker Desktop's port forwarding and the WSL2 VM all shared 12 logical cores. The backends were not starved by one thing; the whole machine was full. So the 1.8× is a limit of **this test machine**, not of the design.
2. **The bottleneck moved.** With one backend, only the backend was at 100%. With four, Postgres went from half a core to about 1.5 cores and nginx from a third of a core to about one. Scaling one part shifts the load to the next part. On a bigger machine Postgres is the likely next limit, since every `GET /api/tasks` is a query.
3. **The work per request grew during the test.** `GET /api/tasks` is not paginated and 15% of requests add tasks, so lists get longer as the run goes on (886 MB received in the 4-backend run).

Also seen: during a small curl check (40 requests) one backend got 16 and the others 8. Each of the 12 nginx workers keeps its own round-robin position, so with few requests the split is uneven. Under real load it evened out: the 4 backends used nearly the same CPU.

### What Test 4 tells us

- **Horizontal scaling works for this API** because auth is stateless (JWT) and the only shared state (rate-limit counters) is in Redis. Any backend can serve any request.
- **Adding Redis, nginx and Docker did not hurt much.** One backend in this setup tops out at ~1,350 req/s, close to ~1,400 for the bare process in Test 3.
- **Defaults can be the bottleneck.** nginx's `events {}` defaults failed half the requests before the backend was even busy.
- **Measure before and after.** The next things to look at are Postgres (connection pooling, pagination, caching the task list in Redis) and running the load generator on a separate machine for honest numbers.

### Limits of Test 4

- k6 and all containers on **one laptop**, so they competed for CPU (see above). Separate machines would show a higher ceiling for 4 backends.
- Requests go through Docker Desktop's port forwarding (Windows → WSL2 VM), which costs CPU and latency that a Linux server would not have.
- One run per setup, so no variance data. The two runs used slightly different rate steps (800 to 2400 vs 1000 to 5000), which is why the "asked" columns differ.
- The 1-backend failure run (nginx defaults) was overwritten by the re-run; its numbers above come from the k6 summary read during the session.

## Test 5: pagination and a Redis cache for the task list (2026-11-03)

Test 4 showed Postgres growing the most when we went to 4 backends (about 0.5 to 1.5 cores). Two changes aim at that:

1. **Cursor pagination.** `GET /api/tasks` returns at most 20 tasks (`?limit=` up to 100) plus a `nextCursor`. New indexes `(userId, createdAt)` and `(userId, status, createdAt)` let Postgres jump to the page instead of sorting all of a user's tasks.
2. **Cache-aside in Redis** (`src/cache/taskCache.ts`). The first page of each tab and the tab counts are stored per user in one Redis hash `taskCache:<userId>` (fields like `list:ALL:20`, `counts`) with a 60 s TTL. Every create, update or delete runs `DEL taskCache:<userId>` **after** the database write. "Load more" pages (with a cursor) are not cached.

To see what each change does on its own, the same test ran twice: **5a** with pagination and the cache switched off (`TASK_CACHE=off`), **5b** with both.

### Setup

Same as Test 4 with 4 backends: Docker Compose, nginx (12 workers, 4096 connections each), Redis rate limiter, `postgres:18`, same laptop. Same k6 `stress` scenario: 85% `GET /api/tasks` (first page, default limit 20), 15% `POST /api/tasks`, 20,000 seeded users, steps averaging about 940, 1875, 2875, 3750 and 4625 req/s (40 s each). Before each run: fresh seed, rate-limit counters and cached pages deleted, Redis command stats reset.

### Results

Done = requests finished in the 40 s step / 40.

| Asked | Test 4 (no pagination, no cache) | 5a: pagination, cache off | 5b: pagination + cache |
|---|---|---|---|
| ~940 req/s | 940 done, p95 32 ms | 937, p95 20 ms | 937, p95 **10 ms** |
| ~1875 req/s | 1875, p95 52 ms | 1865, p95 128 ms | 1875, p95 111 ms |
| ~2875 req/s | 2320, p95 **2.94 s** ❌ | 2485, p95 **1.81 s** ❌ | **2854, p95 140 ms** ✅ |
| ~3750 req/s | 2360, p95 4.59 s | 2620, p95 2.30 s | 3628, p95 361 ms (p99 7.3 s) ⚠️ |
| ~4625 req/s | 2480, p95 5.23 s | 2448, p95 4.27 s | 2908, p95 6.11 s ❌ |

| | Test 4 | 5a: pagination | 5b: + cache |
|---|---|---|---|
| Highest step held with p95 under 200 ms | ~1,875 | ~1,875 | **~2,850** |
| Max finished req/s | ~2,480 | ~2,620 | **~3,630** |
| Failed requests | 0 | 1 of 414,208 | 8 of 488,048 (all in the overloaded last 2 steps) |

**The cache raised the ceiling by about 50%** (from ~1,875 to ~2,850 req/s with p95 still around 140 ms). At ~2,875 req/s, 5a was already drowning (p95 1.8 s) while 5b answered almost everything in time. **Pagination alone changed little in this test**, for the reason explained below.

### Cache hit rate

From `INFO commandstats` in Redis during 5b:

| Command | Calls | Meaning |
|---|---|---|
| `HGET` | 415,143 | every `GET /api/tasks` asks the cache first |
| `HSET` | 93,314 | a miss: read Postgres, then store the page |
| `DEL` | 72,902 | a write (POST) cleared that user's cache |

Hits = 415,143 − 93,314 = 321,829, so **about 78% of list reads never touched Postgres**. That is higher than expected for a test that picks a random user out of 20,000 for every request and writes 15% of the time. Each user got about 24 requests in the run, so several fell inside the 60 s TTL between writes.

### Why: CPU per container under load

| | 5a: cache off | 5b: cache on |
|---|---|---|
| Postgres | 145 to 172% | **70 to 92%** (about half) |
| Each backend | 85 to 115% | 90 to 106% |
| nginx | 85 to 163% | 110 to 220% |
| Redis | 11 to 20% | 14 to 33% |

1. **The cache did what it was meant to do: it took load off Postgres.** Postgres CPU roughly halved while serving more requests.
2. **The bottleneck moved again.** With Postgres relieved, the 4 backends were still at a full core each and nginx became the busiest container (up to 2.2 cores), all on a laptop already near 100% CPU (Test 4). Next limits: backend CPU per request and the machine itself.
3. **Why pagination did not show here.** Seeded users start with 5 tasks and get only a few more during a run, so lists stay under the 20-task page size and responses are the same size with or without pagination. Its value is protection: without it, one user with 50,000 tasks gets all 50,000 rows on every request. Test 5a (~2,500 to 2,600) vs Test 4 (~2,400) is within run-to-run noise.

### Errors seen under overload (from the nginx log)

- **114 × `upstream timed out ... while connecting to upstream`**, all in the last 40 s of 5b (asked ~4,600 req/s). The backends were too busy to accept new connections, so nginx gave up after 60 s and k6 timed out. This is the overload cliff, not a bug.
- **19 × `Connection reset by peer` and 5 × `upstream prematurely closed connection`**, in both runs. This is a known Node + nginx keepalive mismatch: Node closes idle keep-alive connections after 5 s (`server.keepAliveTimeout`), while nginx keeps idle upstream connections for up to 60 s. Sometimes nginx sends a request on a socket Node is closing at that moment. nginx retries most GETs on another backend, so only a few reached the client.

**Fixed (2026-11-04)** in `index.ts`: `server.keepAliveTimeout=65000` (above nginx's 60 s, so nginx always closes an idle connection first) and `server.headersTimeout=66000` (must be above `keepAliveTimeout`, or it can close idle connections first). Neither 5 s nor 60 s was written anywhere: both were defaults. Re-run of 5b with the fix (`k6-paginated-cache-keepalive-fix.txt`):

| nginx log during the run | 5b before | 5b after the fix |
|---|---|---|
| `Connection reset by peer` | 19 | **0** |
| `upstream prematurely closed connection` | 5 | **0** |
| `upstream timed out` (overload in the last step) | 114 | 85 |
| Failed requests (k6) | 8 of 488,048 | **0 of 490,889** |

Throughput was the same (~2,850 req/s with p95 125 ms). The fix is about correctness, not speed.

### What Test 5 tells us

- **A cache helps when reads repeat between writes.** Here 78% of reads were served from Redis, Postgres CPU halved, and the ceiling rose about 50%.
- **Invalidation works under load.** 72,902 writes each cleared the cache, and the next read rebuilt it from Postgres.
- **Pagination is a safety limit**, not a speed-up for small lists. It will matter once some users have hundreds of tasks.
- **Each fix moves the bottleneck**: Postgres in Test 4, then the backends, nginx and the laptop's CPU in Test 5.

### Limits of Test 5

- Everything still runs on one laptop, so the numbers are limited by that machine (see Test 4).
- A real user reloading their own list would get an even higher hit rate. A write-heavy workload would get a lower one.
- The `counts` endpoint and "load more" pages were not part of the k6 mix.
- One run per setup, so differences of about 10% (Test 4 vs 5a) are noise.

## Limits of this test (read before trusting the numbers)

- **k6, the server and Postgres shared one machine**, so they competed for CPU. Real capacity on separate machines is likely higher, but network latency would add to every request.
- **Redis was not tested** in Tests 1 to 3. Docker was not running and no Redis server was installed, so the `RedisStore` path was unmeasured. (Test 4 above does use `RedisStore`.)
- The ceiling (about 1,400 req/s) is for this machine, this mix and a task list of about 5 rows per user. It will be lower with bigger lists or heavier queries.
- `GET /api/tasks` was **not paginated** in Tests 1 to 4. Tasks accumulate during the run (15% of requests are POSTs), so list responses grow. (Paginated since Test 5.)
- Login and register were not load tested. bcrypt (12 rounds) is CPU-heavy and will be far slower per request than the task routes.
- The run used `tsx`, not a built app, and one run per scenario, so there is no variance data.

## Things noticed in the code while testing

- ✅ Fixed: `config/rateLimit.ts`: `registerLimiter` used `windowMs: 5*60*100` (30 s), now `5*60*1000`.
- ✅ Fixed: `ratelimit.middleware.ts`: `Math.ceil(resetAt-Date.now())/1000` applied `ceil` before the division, so `Retry-After` could be fractional. Now `Math.ceil((resetAt-Date.now())/1000)` (checked: `Retry-After: 299`).
- ✅ Fixed: `app.ts`: `exposedHeaders` had `"Retry-Afters"`, so browsers couldn't read `Retry-After`.
- Still open: `redis.ts`: no `disableOfflineQueue`. With `REDIS_URL` set and Redis down, commands queue and requests can hang instead of falling through. Not tested.
- ✅ Fixed: `index.ts`: Node's default `keepAliveTimeout` (5 s) was shorter than nginx's upstream keepalive (60 s), which caused a few `Connection reset by peer` errors in Test 5. Now 65 s / `headersTimeout` 66 s (see Test 5).

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

### Re-run Test 4 (Docker, PowerShell)

```powershell
# project root: start 1 (or 4) backends behind nginx
docker compose up -d --build --scale backend=1
docker compose restart nginx          # nginx looks up the backend IPs only at start

# backend folder: seed into the Docker database (port 5433), not the one in .env
cd backend
$env:DATABASE_URL="postgresql://app:app@localhost:5433/taskmanager"
npx tsx test/seed.ts 20000

# clear old rate-limit counters, then run
docker compose exec redis sh -c "redis-cli --scan --pattern 'ratelimit:*' | xargs -r redis-cli DEL"
k6 run -e SCENARIO=stress -e RATES=800,1200,1600,2000,2400 test/load.js      # 1 backend
k6 run -e SCENARIO=stress -e RATES=1000,2000,3000,4000,5000 test/load.js     # after --scale backend=4
```
Tokens expire after 15 minutes, so seed again before each run.

### Re-run Test 5 (cache off vs on)

```powershell
# project root. Cache off:
$env:TASK_CACHE="off"; docker compose up -d --build --scale backend=4; docker compose restart nginx
# ...seed and clear counters as above, then:
docker compose exec redis redis-cli CONFIG RESETSTAT
k6 run -e SCENARIO=stress -e RATES=1000,2000,3000,4000,5000 test/load.js

# Cache on (the default):
Remove-Item Env:TASK_CACHE; docker compose up -d --scale backend=4; docker compose restart nginx
# ...seed again, clear counters AND cached pages:
docker compose exec redis sh -c "redis-cli --scan --pattern 'taskCache:*' | xargs -r redis-cli DEL"
docker compose exec redis redis-cli CONFIG RESETSTAT
k6 run -e SCENARIO=stress -e RATES=1000,2000,3000,4000,5000 test/load.js
docker compose exec redis redis-cli INFO commandstats    # HGET = reads, HSET = misses, DEL = invalidations
```
