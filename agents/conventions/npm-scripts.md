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

### The clean family

`clean` is the fully collapsed alias and must leave no generated package output behind. Its
`clean:build` leaf removes every current or orphaned `packages/*/dist` directory and every sibling
`*.tsbuildinfo`, then asks TypeScript to clean the outputs known to the current project graph. The
filesystem sweep must happen before `tsc -b --clean`: a renamed-away project is unreachable from the
current graph, and removing declarations while retaining their build metadata can make a later build
incorrectly treat the missing declarations as current.

There is deliberately no root `clean:dist` leaf. Distribution removal cannot safely be separated from
build-metadata removal, so exposing the narrower-looking name would create the same false clean-state
signal under a different spelling. Package-local `clean:dist` remains the final prepack sweep after
that package's TypeScript clean.

`build:clean` is the build action in clean mode: it invokes the complete `clean` alias and then builds.
It is not a substitute for `clean:build`; the action is different.

`check:package-dist-orphans` is the standing precommit detector for clone-specific residue: it fails
when an immediate `packages/*` directory has `dist` but no `package.json`. Live package distributions
are generated noise — `rg` ignores them through `.gitignore`, while plain recursive `grep` does not —
but an orphaned distribution can masquerade as an API that still exists. This is not only disk hygiene:
plain `grep -r` can surface declarations for a removed package and misdirect work toward an absent API.
Tool choice removes that search noise; only pruning removes the lie. The detector gates this misleading
case in both precommit and the bare `npm run check` sweep. A scoped package check omits it because ignored
clone state is repository-wide rather than package-specific.

The precommit detector reports the paths and asks the user to run `npm run clean`; it never mutates the
tree itself. Detection is based only on directory and manifest existence, never timestamps. Explicit
cleanup retains the ordering above so `dist` and sibling `*.tsbuildinfo` disappear together before
TypeScript cleans the current project graph.

The test is deliberately one line of evidence: `packages/<name>/dist` is a directory and its sibling
`package.json` does not exist. Neither apparent substitute proves the tree clean. `tsc -b --clean`
walks only the current project graph, so it can never reach output for a package renamed out of that
graph. Running `scripts/clean-package-dist.ts` from that removed package cannot help either, because
package-local cleanup requires a manifest; the root filesystem sweep is what reaches every directory.
A directory mtime records changes to its entry list, not writes to existing file contents, so a fresh
directory date from a rebuild is no reassurance that an obsolete declaration disappeared.

Keep the evidence boundary honest. The investigation found 22 orphan distributions in one clone and
none in three others, so this is clone residue rather than a universal checkout defect. Cleaning stale
distributions changed no gate outcome on three independent trees. The detector exists because graph-only
cleanup cannot truthfully claim to remove renamed-away output and that output can pollute searches, not
because stale distributions were shown to break a build or test.

### Repository provenance gates

`check:license-provenance` has two independent signals. The token lane scans declared terms, never a
vendor or corpus name; a token-only finding can be removed while its fetch recipe stays intact. The
origin lane does not need a token: it freezes a sentence only when an origin verb takes a third-party
implementation object — external code, a branded or pronoun-owned symbol/function, or an external
repository path — while format facts, standards, mathematical relations, internal Flight history and
API-pattern comparisons remain valid. Semantic negatives are must-pass cases. Positive verification
against licensed material is equally valid: `licensed` describes how an external asset was used and is
not itself a token. The root notice and exact package-manifest properties are structural sites;
generated lock metadata and the two repository-policy examples are named, justified escapes printed on
every run. The gate runs in precommit and the bare `npm run check` sweep.

`check:fingerprint-computation-id` requires every functional and example fingerprint column to retain its
scene-source hash. Named historical columns have neither a pixel hash nor a recoverable write boundary;
the command names each one and prints why absence is the honest state. It runs beside `support:check` in
the bare repository sweep, while focused package checks omit both repository-wide baseline invariants.

`capture:provenance` is the non-gating currency census for those hashes. Its default denominator is every
committed examples + functional fingerprint column, including evidence whose live scene no longer resolves.
That global number is not comparable with a scoped validation run. To make that comparison, pass the run's
versioned report with `--tool <examples|functional> --validation-report <path>`; the census then selects only
the passed/failed regression identities the run actually gated. Exact-match counts remain visible as the
hash-rule control, and the exact-vs-fingerprint freshness gap is printed as its own named measurement.

## Read vs write: `:baseline`

A check that compares against a committed baseline **reads** under its bare name and **writes** under `:baseline`. `size` compares; `size:baseline` rewrites. `test:functional:regression` compares; `test:functional:regression:baseline` rewrites. `:baseline` is always the write-mode of the check it follows — and only a check that owns a baseline has one (smoke and parity have nothing to write).

The size pair also carries the rule's limit: **one subject, one instrument.** `size` and `test:size`
once both compared bundle bytes against the same baseline by different mechanisms, and the two docs
that described them named different commands as the check — so neither a reader nor an agent could
say which gate existed. They are now one instrument per baseline: `size` / `size:baseline` for the
unminified tree-shaking number, `size:minified` / `size:minified:baseline` for the shipping one. A
third name for either subject would be that defect returning, not a convenience.

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

All render checks invoke `@flighthq/tool-capture`: `capture --fail-on-error` runs smoke reporting, `validate` runs parity (`--no-regression`), regression (`--no-parity`), and baseline writes (`--update-fingerprints`), and `benchmark` samples repeatable synchronized work (`--update-benchmarks` writes stable performance baselines).

The subject umbrellas dogfood its higher-level batch workflow: `test:functional` and `test:examples` select one subject from `tool-capture.batch.json`, while `test:browser` processes both subjects through one multi-subject plan. The leaf smoke/parity/regression and baseline commands remain available for focused reads and writes.
