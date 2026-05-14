---
slides-ng-theme: night
slides-ng-transition: slide
slides-ng-code-theme: github-dark
title: "Demo: Pulse — internal status dashboard"
---

# Pulse

A dashboard for the things we keep forgetting to look at.

<!-- slide: notes="Demo deck — 10 min slot. Pace for live clicks." -->

---

## The problem

- 14 services, 6 dashboards, 4 oncall rotations
- Status info is everywhere AND nowhere
- New engineers spend a week just learning what to check

<!-- slide: notes="Set context before showing anything." -->

---

## What Pulse does

> One page. Every service. Live.

- Pulls from Datadog, Sentry, Statuspage, PagerDuty
- Health, error rate, latency, oncall — at a glance
- Click any tile → drill-down view

---

## Live demo

<small>(switching to the actual app)</small>

<!-- slide: notes="Switch to browser. Show the landing page. Click 2-3 tiles. Don't open settings — that's where the demo gods get angry." -->

---

## Architecture

```
Pulse Frontend
     ↓ (read-only)
  Pulse API  ──→  Postgres  ←── Aggregator job (60s)
     ↓                            ↑ ↑ ↑ ↑
     └─→ Datadog · Sentry · Statuspage · PagerDuty
```

API caches every source in Postgres on a 60s aggregator job. Frontend is read-only.

---

## What's in the box (today)

| Feature              | Status     |
|----------------------|------------|
| Service tiles        | Shipped    |
| Drill-down view      | Shipped    |
| Slack `/pulse` cmd   | Shipped    |
| Mobile responsive    | In progress|
| Public status export | Backlog    |

---

## What's next

1. Mobile responsive (this sprint)
2. SLO tracking per service (next sprint)
3. "What changed?" diff view (Q3)
4. Public-facing status page (Q4)

---

## Who's using it

- All of platform team
- 60% of product engineers
- Oncall checks it first now (was Datadog before)

---

## Ask

- **Try it** at pulse.internal.example.com
- **Tell us** what's missing for *your* service
- **Be patient** with the mobile beta

Slack `#pulse` for feedback.

---

# Questions

