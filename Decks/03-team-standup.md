---
slides-ng-theme: white
slides-ng-transition: none
title: "Weekly Sync — 2026-05-14"
---

# Weekly Sync

2026-05-14

<!-- slide: notes="Keep it tight — target 10 minutes total." -->

---

## What shipped

- Auth refresh-token rotation (finally) — **Priya**
- v2.3 mobile rollout, 35% of users — **Diego**
- Customer dashboard "filter by tag" — **Sam**

---

## In flight

| Owner   | Item                       | Eta       |
|---------|----------------------------|-----------|
| Priya   | OAuth2 PKCE migration      | Fri       |
| Diego   | iOS background refresh fix | Next week |
| Sam     | Tag-based notifications    | TBD       |
| Marcus  | Postgres 16 upgrade plan   | Mon       |

---

## Blockers

- **Sam** — needs design review on notification toasts (pinged Lin)
- **Marcus** — waiting on infra capacity confirmation

That's it.

---

## Risks I'm watching

- Mobile rollout on Android 12 — small spike in crash rate, monitoring
- DB migration window — second weekend in June, watch for conflicts

---

## Reminders

- **Wed** — retro at 2 pm
- **Fri** — code freeze for v2.4
- **Next Mon** — Marcus's Postgres plan due

---

# Questions or anything I missed?

<!-- slide: notes="If nobody jumps in, end the meeting early — that's a win." -->
