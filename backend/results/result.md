# Load test results

Tests: `backend/test/` (`seed.ts`, `load.js`, `cleanup.ts`). Raw k6 output: `k6-limiter.txt`, `k6-capacity.txt`, `k6-capacity.json`.

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

## What this tells us

- A single Node process with the in-memory limiter sustained **about 1000 req/s** for this read-heavy mix with zero server errors. I did **not** find its breaking point: the highest stage was the top of the ramp.
- The median stays low, but **p95 and p99 grow** under load (p99 about 318 ms), so the tail is where the strain first shows.
- 429s only hit users who went over their own limit. The limiter did not slow other users.

## Limits of this test (read before trusting the numbers)

- **k6, the server and Postgres shared one machine**, so they competed for CPU. Real capacity on separate machines is likely higher, but network latency would add to every request.
- **Redis was not tested.** Docker was not running and no Redis server was installed, so the `RedisStore` path (network hop per request, atomic Lua script) is unmeasured. Expect higher per-request latency than `MemoryStore`.
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
npx tsx test/seed.ts 1000            # create users and tokens (valid 15 min)
REDIS_URL= npx tsx index.ts          # in another terminal; empty REDIS_URL = in-memory limiter
k6 run -e SCENARIO=limiter  test/load.js
k6 run -e SCENARIO=capacity test/load.js
npx tsx test/cleanup.ts              # remove the test users
```
Restart the server between the two scenarios if you re-run, or the in-memory counters carry over.
