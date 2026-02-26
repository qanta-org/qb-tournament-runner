# Bracket Creation Workflow

This document describes the full workflow of tournament bracket creation, including all user decisions and how they affect the generated schedule.

## Terminology

| Term | Definition |
|------|-------------|
| **Prelims** | Phase 1: round robin (full, double, or grouped). Teams play within their pool. |
| **Qualifiers** | Teams that advance from prelims (top 1 or 2 per group for grouped; top 2/4/8 for non-grouped). |
| **Qualifier RR** | Optional Phase 2 (grouped prelims, 3+ qualifiers only): round robin among qualifiers; top N (2, 4, or 8) advance to Playoffs. Modeled as its own phase (`qualifiers`) in the data model. |
| **Playoffs** | Phase 3 (or Phase 2 when no Qualifier RR): single-elim bracket — Finals (2), Semifinals+Finals (4), or Quarterfinals+Semifinals+Finals (8). |

Flow: **Prelims** → (optional **Qualifier RR**) → **Playoffs**. When Qualifier RR is used, it is a distinct phase between prelims and playoffs; otherwise qualifiers go directly to the playoff bracket.

## Constraint Table

Playoff bracket size options (2, 4, 8) are constrained by pool size:

| Pool size | Allowed playoff sizes |
|-----------|------------------------|
| 2 | 2 |
| 3 | 2 |
| 4–7 | 2, 4 |
| 8+ | 2, 4, 8 |

- **Pool size** = team count (non-grouped / no prelims) or qualifier count (grouped)
- Examples: 6 teams → [2, 4]; 8 teams → [2, 4, 8]; 3 qualifiers → [2]

---

## User Decision Tree

### Step 1: Prelim Style

| Choice | Description | When to use |
|--------|-------------|-------------|
| **No prelims** | Skip directly to playoffs | Single-elimination only; quick tournaments |
| **Full Round Robin** | Every team plays every other team once | 4–8 teams; fair seeding |
| **Double Round Robin** | Play every opponent twice | Smaller fields; more games |
| **Grouped Round Robin** | Split into groups; RR within each group | 6+ teams; shorter prelim phase |

### Step 2: Advance to Qualifiers (grouped only)

| Decision | Options | Effect |
|----------|---------|--------|
| **Advance to Qualifiers** | Top 1 per group or Top 2 per group | Qualifier count = groups × advance |

### Step 3: Qualifier Path (grouped, 3+ qualifiers only)

When grouped prelims produce **3 or more** qualifiers:

| Choice | Description | Packets |
|--------|-------------|---------|
| **Direct bracket** | Qualifiers go to single-elim bracket (may have byes) | `ceil(log2(N))` |
| **Qualifier RR** | Qualifiers play RR; top N (2/4/8) advance to bracket | `rrRounds(qualifiers) + bracketRounds(N)` |

### Step 4: Advance to Playoffs

For **non-grouped** prelims (Full RR, Double RR) or **no prelims**:

| Choice | Bracket structure | Packets |
|--------|-------------------|---------|
| **2** | Finals only | 1 |
| **4** | Semifinals + Finals | 2 |
| **8** | Quarterfinals + Semifinals + Finals | 3 |

Options are constrained by pool size (see Constraint Table).

For **grouped** prelims with **Direct bracket**: same options (2, 4, 8), constrained by qualifier count.

For **grouped** prelims with **Qualifier RR**: same options (2, 4, 8), constrained by qualifier count — top N from RR advance to playoffs.

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. PRELIM STYLE                                                  │
├─────────────────────────────────────────────────────────────────┤
│  No prelims ──────► Advance to Playoffs (2, 4, or 8)             │
│  Full RR ─────────► Prelims + Advance to Playoffs (2, 4, or 8)   │
│  Double RR ───────► Prelims + Advance to Playoffs (2, 4, or 8)  │
│  Grouped RR ──────► Advance to Qualifiers (top 1 or 2 per group)  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ADVANCE TO PLAYOFFS (non-grouped / no prelims)                │
├─────────────────────────────────────────────────────────────────┤
│  2 → Finals only                                                  │
│  4 → Semifinals + Finals                                          │
│  8 → Quarterfinals + Semifinals + Finals                          │
│  (Options constrained by team count)                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. GROUP CONFIG (grouped only)                                   │
├─────────────────────────────────────────────────────────────────┤
│  Groups: 2, 3, or 4                                              │
│  Advance to Qualifiers: Top 1 or Top 2 per group                 │
│  → Qualifiers = groups × advance                                 │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. QUALIFIER PATH (grouped, 3+ qualifiers only)                  │
├─────────────────────────────────────────────────────────────────┤
│  Direct bracket  → Advance to Playoffs (2, 4, or 8, constrained) │
│  Qualifier RR    → Advance to Playoffs: 2, 4, or 8 (constrained)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Example Scenarios

### Scenario A: 8 teams, Full RR, Top 4 to playoffs

- **User decisions**: Prelim = Full RR; Advance to Playoffs = 4
- **Result**: 7 prelim rounds (28 games) + 2 playoff rounds (3 games) = 9 rounds, 31 games
- **Bracket**: Semifinals + Final

### Scenario B: 6 teams, Grouped (2 groups of 3), Top 1 per group, Direct bracket

- **User decisions**: Prelim = Grouped; 2 groups; Advance to Qualifiers = 1; Qualifier path = Direct bracket; Advance to Playoffs = 2 (only option for 2 qualifiers)
- **Result**: 3 prelim rounds (6 games) + 1 playoff round (1 final) = 4 rounds, 7 games
- **Bracket**: 2 qualifiers → Finals only

### Scenario C: 6 teams, Grouped (3 groups of 2), Top 1 per group, Qualifier RR

- **User decisions**: Prelim = Grouped; 3 groups; Advance to Qualifiers = 1; Qualifier path = Qualifier RR
- **Result**: 1 prelim round (3 games) + 3 qualifier RR rounds (3 games) + 1 Final = 5 rounds, 7 games
- **Bracket**: 3 qualifiers play RR; top 2 advance to Final (only 2 allowed for 3 qualifiers)

### Scenario D: 8 teams, No prelims, 8-team bracket

- **User decisions**: Prelim = None; Advance to Playoffs = 8
- **Result**: 3 playoff rounds (7 games) = 3 rounds total
- **Bracket**: Quarterfinals + Semifinals + Finals

### Scenario E: 6 teams, Grouped (3 groups of 2), Top 2 per group, Direct bracket, 4 to playoffs

- **User decisions**: Prelim = Grouped; 3 groups; Advance to Qualifiers = 2; Qualifier path = Direct bracket; Advance to Playoffs = 4
- **Result**: 1 prelim round (3 games) + 2 playoff rounds (3 games) = 3 rounds, 6 games
- **Bracket**: 6 qualifiers → top 4 to Semifinals + Finals

---

## Bracket Sandbox

A visual sandbox at **`/test/brackets`** lets you explore these options without a dataset:

1. **Team count** (2–12)
2. **Prelim style**: No prelims, Full RR, Double RR, Grouped RR
3. **Advance to Qualifiers** (grouped): Top 1 or Top 2 per group
4. **Qualifier path** (grouped, 3+ qualifiers): Direct bracket vs Qualifier RR
5. **Advance to Playoffs** (2, 4, or 8) — options constrained by pool size

The sandbox shows the generated schedule, round labels, and packet requirements in real time.

---

## Packet Requirements Summary

| Phase | Formula |
|-------|---------|
| Full RR prelims | `N-1` rounds (even N) or `N` rounds (odd N) |
| Double RR prelims | 2× RR rounds |
| Grouped RR prelims | `max(rrRounds per group)` |
| Direct bracket | `ceil(log2(teams))` rounds |
| Qualifier RR + Bracket | `rrRounds(qualifiers) + bracketRounds(N)` |

Total packets needed = prelim rounds + playoff rounds.
