# Stickiness Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/adiyananurulkhusna/stickiness-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/adiyananurulkhusna/stickiness-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

**Stickiness Radar** ranks pre-token protocols by how durable they are — not by size
alone, and not by one hot week. Capital that stays is worth more than capital that
visits: a protocol whose TVL barely moves week to week, and that has run for years with
no token, has a record a token launch would inherit. This entry is for the make.fun
bounty **token-radar-01** ("Build the best token launch radar", $1,325), scored against
the frozen DefiLlama snapshot of 2026-11-14.

## The model

Every row is scored by the same function, from the snapshot's own figures. No protocol
name is special-cased and no row is hand-picked.

**1. Base value.** Take the protocol's TVL and multiply it by the median
market-cap/TVL ratio of the protocols in the snapshot that already have a token
(computed from the snapshot on every run — in this snapshot the median is about 0.21).
The median, not the mean, because a few tiny-TVL tokens with huge caps drag the mean
far above the typical protocol.

**2. Stability factor.** From the absolute 7-day TVL change:

```
stability = 1.15 − min(|change_7d|, 60) / 60 × 0.30
```

1.15 when the TVL did not move at all, sliding down to 0.85 when the absolute move
reaches 60% or more. A wild week costs the same in either direction — a +60% week and
a −60% week are equally unreliable as a base to stand on. An unreported 7-day change
earns the neutral 1.00, never the top of the range: missing data is not evidence of
calm.

**3. Age factor.** From how long the protocol has run with no token:

```
age = 0.70 + min(age_days, 1095) / 1095 × 0.30
```

0.70 for a protocol listed today, rising to 1.00 at three years. An unknown listing
date counts as 365 days. A long record with no token is a tested record.

**4. The ranked column.**

```
implied_value_usd = round(base × stability × age)
```

Rows are sorted by that number, highest first.

## Coverage

- The board covers **all 40 watchlist slugs** (TVL ≥ $50M, no token on record), plus
  160 pre-token protocols below the floor, picked by TVL — 200 rows in total.
- Protocols that already have a token are set aside in a separate "Live token" view
  with their real market caps, never mixed into the ranking.
- Exchanges, versioned pools and wrapped/staked products are not ranked.

## The dashboard

`dashboard/` is a static page with no network and no build step: it reads `data.js`,
which `main.ts` writes from the same board.

- Search by name, category or chain; filter by category, chain and minimum TVL;
  a watchlist-only toggle; sorts by implied value, TVL, stability factor, age,
  7-day growth and name.
- A **detail drawer** per protocol: the model's full breakdown (TVL, median ratio,
  base value, 7-day change, stability and age factors, implied value), the farm cost,
  and the step-by-step farm plan with its estimated cost per step.
- A **"Calmest TVL" panel**: the five pre-token protocols whose TVL moved least in
  the last seven days.
- A **farm cost table** with the per-step estimate for every chain.
- Every farm plan is built around staying: a weekly action, a long hold with a
  monthly top-up, and no step that closes the position early. A farm that leaves
  after a week is a visit, not a stake.

## How to run

Node 22, standard library only — nothing to install:

```sh
node main.ts --input /path/to/snapshot.json --output ./out
```

This writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/`
and `out/dossier.json`. Then open `out/dashboard/index.html` in a browser. The
program exits non-zero if the board fails the gate (missing watchlist slugs, wrong
order, bad farm steps, or fewer than 3 screenshots).

## Caveats

- **Implied value is a model, not a price prediction.** It says what a token might
  be worth *if* the market priced this protocol like the median token-bearing
  protocol today, weighted toward calm weeks and long histories. It is not a
  forecast of any token's price, and an airdrop is never guaranteed: a protocol may
  never issue a token at all.
- Farm costs are estimates, not live gas prices. Check the real cost before you
  spend anything, use a fresh wallet that holds only what you plan to farm, and
  never pay anyone to claim an airdrop — claim only from links the protocol itself
  publishes.
- The snapshot is frozen at 2026-11-14. Protocols change; this board does not move
  with them.
