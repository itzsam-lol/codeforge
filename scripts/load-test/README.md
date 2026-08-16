# Load test: concurrent candidate cohort

Simulates the exact scenario the go-live audit flagged as never having been exercised: a cohort
of candidates all starting a scheduled test within the same short window, not one at a time.
Before this existed, every verification of the candidate flow (this session and prior) was
single-user and manual — there was no data on what happens when real concurrency hits the API,
Judge0, or the Docker executor.

## Running it

```sh
npm run load-test:setup [count]   # default 20 — logs in as the seeded admin, invites `count`
                                   # candidates to a real published test, writes their tokens
                                   # (+name/email, needed by verify-identity's own matching
                                   # check) to scripts/load-test/tokens.csv
npm run load-test                 # runs candidate-flow.yml against tokens.csv
npm run load-test:cleanup         # revokes the invitations setup.mjs created
```

`candidate-flow.yml`'s `arrivalCount` must match (or be ≤) however many tokens `setup.mjs`
generated — it doesn't read the count automatically.

The scenario walks the real flow: `verify-identity` → `start` → three autosave `PUT
.../draft` calls (simulating a candidate typing) → `finish`. Same endpoints, same payload shapes
TestRunner.tsx actually sends.

## The identityLimiter ceiling — read this before assuming a failure is a bug

`verify-identity` is rate-limited to 20 attempts per 15 minutes **per IP**
(`middleware/rateLimit.ts`'s `identityLimiter`) — a deliberate anti-brute-force control (it's the
same endpoint an attacker would hammer to guess a candidate's email against a stolen invitation
link). Real candidates each connect from their own IP, so this never trips for genuine cohort
traffic. This test harness runs every simulated candidate from **one** IP (wherever you run it
from), so a batch larger than ~20 will start hitting 429s that have nothing to do with system
capacity — that's the anti-abuse control doing exactly its job against what looks, from the
server's perspective, like one IP rapidly trying many identities.

To test above 20 from a single machine anyway (e.g. to see how the API behaves at real scale, not
just to prove the happy path): clear that IP's bucket in Redis between runs —
```sh
docker exec codeforge-redis-1 redis-cli DEL "rl:identity:<your IP, e.g. ::1>"
```
— or distribute the load across multiple source IPs the way real candidates would arrive.

## Last verified result (20 concurrent candidates, local dev machine)

```
vusers.created:    20
vusers.completed:  20
vusers.failed:     0
http.codes.200:    140   (7 requests × 20 candidates)
p95 response time: 47.9ms
p99 response time: 67.4ms
max response time: 83ms
```

Zero failures, no request over 83ms. This is one machine's local dev stack, not a production
deployment's real hardware/network — re-run this against a client's actual infrastructure before
promising them a specific concurrent-cohort size, and scale `count` to match what they'll
actually throw at it.
