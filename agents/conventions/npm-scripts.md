# npm Script Naming

Read this before adding, renaming, or removing a root `package.json` script. It encodes decisions that are easy to violate and not obvious from reading one script line.

## Grammar

Scripts are colon-delimited, most-general segment first:

```
action : subject : modifier…
```

- **action** — the verb: what you do. `build`, `test`, `dev`, `capture`, `size`, `order`, `lint`, …
- **subject** — what it acts on, sitting _immediately_ after the action: a tool (`functional`, `examples`, `gallery`), a layer (`unit`, `integration`, `api`), or a measured thing (`size`). The subject is the parity axis — `build:examples`, `test:examples`, and `dev:examples` all name the same subject under different actions.
- **modifier(s)** — narrow the action: a check (`smoke`, `parity`, `regression`), a mode (`baseline`, `watch`, `check`, `fix`), or a tolerance.

**Never let a non-subject word take the subject slot.** `verify:render:examples` is wrong: `render` is fighting `examples` for the slot, and the write variant then stacks to `verify:render:examples:baseline`. When a distinction needs a new word, make it a **modifier after the subject** or a **different action** — not a second subject. (This is why the cross-backend render check is `test:*:parity`, a modifier, and the fingerprint comparison is the `test` action rather than a separate verb crowding the subject.)

## Collapsing (aliases)

Omitting a segment yields a **collapse alias** that fans over the omitted axis. Aliases only chain leaf scripts — the real command always lives in the leaf, never duplicated into the alias.

- **Omit the subject** → run that modifier across every subject. `test:parity` = `test:functional:parity && test:examples:parity`.
- **Omit the modifier** → the umbrella for that subject (all of its checks). `test:functional` = smoke + parity + regression for functional.
- **Omit the action** (bare name) → the implied action is _run_. For a dev tool, "run" is most valuable as the dev server (build-and-run buys little for an interactive tool), so the bare name aliases `dev:`. `examples` → `dev:examples`.

Every meaningful collapse should exist, so the obvious thing to type works. Including the fully-collapsed one: `test:baseline` (omit both subject and check, keep the write mode) rewrites every render-test baseline.

## Read vs write: `:baseline`

A check that compares against a committed baseline **reads** under its bare name and **writes** under `:baseline`. `test:size` compares; `test:size:baseline` rewrites. `test:functional:regression` compares; `test:functional:regression:baseline` rewrites. `:baseline` is always the write-mode of the check it follows — and only a check that owns a baseline has one (smoke and parity have nothing to write).

## Word choice

- Use the word a reader reaches for unprompted; if a name needs explaining, find a more precise one.
- Avoid words that misdescribe the mechanism. The regression check compares a _tolerant coarse fingerprint_, not an exact hash — so it is `fingerprint` / `regression`, never `hash` (which implies an exact match and would set the wrong expectation).
- Name the _question_, not the implementation: `smoke` (does it run / draw anything), `parity` (do the backends agree with each other — consistency), `regression` (does it match the blessed baseline — correctness).

## Worked example: the render-test family

Two subjects × three checks; `regression` additionally has a write mode. Smoke and parity are environment-independent (CI gates every PR); regression is coupled to where its fingerprint baselines were captured.

|  | smoke | parity | regression | regression (write) |
| --- | --- | --- | --- | --- |
| **functional** | `test:functional:smoke` | `test:functional:parity` | `test:functional:regression` | `test:functional:regression:baseline` |
| **examples** | `test:examples:smoke` | `test:examples:parity` | `test:examples:regression` | `test:examples:regression:baseline` |

Collapses over these leaves:

| alias | expands to |
| --- | --- |
| `test:functional` / `test:examples` | that subject's smoke + parity + regression (umbrella) |
| `test:smoke` / `test:parity` / `test:regression` | that check across both subjects |
| `test:functional:baseline` / `test:examples:baseline` | that subject's baseline write (its `:regression:baseline`) |
| `test:regression:baseline` | both subjects' regression baseline writes |
| `test:baseline` | every render-test baseline (today: `test:regression:baseline`) |
| `functional` / `examples` / `gallery` | the matching `dev:*` server |

The mechanics behind these scripts live in `scripts/capture.ts` (smoke, via `--fail-on-error`) and `scripts/compare-render.ts` (parity = `--no-regression`, regression = `--no-parity`, write = `--update-fingerprints`).
