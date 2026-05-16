---
slides-ng-theme: black
slides-ng-transition: slide
title: Building Resilient Systems
---


# Building Resilient Systems

Lessons from running production for a decade

<!-- slide: notes="Welcome the audience. Mention the 10-year journey. Don't read these notes verbatim." -->

---
## Who am I

- 10 years building backend systems
- 4 companies, 2 continents
- Lost count of incidents

<!-- slide: notes="Brief intro. Set up credibility but keep it humble." -->

---

## Today's agenda

1. The illusion of uptime
2. Failure modes you'll meet
3. Patterns that actually help
4. What to throw away

<!-- slide: notes="Three sections plus a wrap. Keep moving — this is a roadmap, not the meal." -->

---

## The illusion of uptime

> "Our system is 99.9% up"

What that *actually* means:

- 43 minutes of downtime per month
- ~8 hours of degraded performance
- Several "weird" pages

<!-- slide: notes="The pull quote is the hook. Then break down what those numbers translate to in lived experience." -->

---

## Failure modes (1/3): cascading

When a slow service blocks its callers:

```
Frontend  →  API gateway  →  Slow service
                         ↘
                            Healthy service

Slow service times out
  → API gateway threads pile up waiting
    → Frontend requests fail
```

The slow service IS the failure. What makes it bring down *everything* is the back-pressure.

<!-- slide: notes="Walk through the cascade. The slow service IS the failure — what makes it bring down everything else is the back-pressure." -->

---

## Failure modes (2/3): retry storms

```python [1|2-3|4-7|all]
def call_service():
    # Innocent-looking retry
    for attempt in range(5):
        try:
            return requests.get(API, timeout=2)
        except Timeout:
            continue
```

What's the worst case? `5x` your usual load on the downstream service.

<!-- slide: notes="Line-step through. Pause on the retry count. Ask the room: 'What's the worst case?'" -->

---

## Failure modes (3/3): silent data loss

| Layer        | What it logs           | What you'd want |
|--------------|------------------------|-----------------|
| LB           | 200 OK                 | "client gave up" |
| App          | dropped event id 4012  | "and why" |
| DB           | committed transaction  | "but to wrong shard" |

<!-- slide: notes="The scariest one. No errors anywhere — but the data is in the wrong place." -->

---

## Patterns that help

- Circuit breakers (sane defaults, not magic numbers)
- Bulkheads (isolate the dependency, isolate the threadpool)
- Idempotency keys (because retries are inevitable)
- Backpressure (your queue is not a bottomless pit)

<!-- slide: notes="One slide, four patterns. Audience won't remember details — they'll remember the framing." -->

---

## What to throw away

- 100-page runbooks nobody reads
- Dashboard walls with 47 widgets
- Alerts on metrics that "might be useful"
- The dream of zero downtime

<!-- slide: notes="Be controversial here. The last bullet usually gets a laugh." -->

---

# Questions?

<small>slides at: github.com/example/talks</small>

<!-- slide: notes="Pause. Don't fill the silence. Have a few prepared seed questions ready in case the room is shy." -->
