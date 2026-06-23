# Build Proposals

A curated, living backlog of **build artifacts**: one file per package, each describing work to either **build out a new package** or **add depth to an existing one**. Proposals are shaped in conversation, then handed to individual agents to build.

This is distinct from `../docs/reviews/` (the immutable analysis corpus). A proposal is _distilled from_ a review/maturation doc when we decide to pursue it, and links back to its source. Reviews are read-to-know; proposals are the thing you greenlight and hand off.

## One flat folder, status in frontmatter

Every proposal lives directly in this folder as `<target>.md`. There are **no `proposed/` / `approved/` subfolders** — lifecycle is the `status:` field, so paths are stable and links never break. Use [`index.md`](index.md) (generated) for the at-a-glance view, or grep frontmatter.

```
status: proposed   → built up, under discussion. Not ready to build.
status: approved   → greenlit. The Agent brief + Acceptance are final; ready to hand off.
status: building   → an agent is actively building it.
status: done       → shipped and verified.
status: superseded → dropped or replaced (note why in the Decision log).
```

The **greenlight** is the edit `status: proposed` → `status: approved`. That is the deliberate gate: nothing should be built until its proposal is `approved`.

## Anatomy of a proposal

Frontmatter (tracking) + body (built for two readers — you shaping it, and an agent building it). See [`TEMPLATE.md`](TEMPLATE.md). Key body sections:

- **Summary / Scope (this build)** — what & why, and the tier slice (Bronze/Silver/Gold) targeted now.
- **Design** — the tiered plan, types-in-`@flighthq/types`-first.
- **Acceptance** — definition of done + the exact verify commands.
- **Open questions** — resolve these in conversation _before_ greenlighting.
- **Agent brief** — the self-contained instruction block you paste to an agent/Task.
- **Decision log** — dated notes from shaping conversations.

## Workflow

1. **Shape** — discuss; edit the proposal's Scope / Design / Open questions; record decisions in the Decision log. Status stays `proposed`.
2. **Greenlight** — when the Agent brief + Acceptance are final and open questions are resolved, set `status: approved`.
3. **Build** — hand the file to an agent (paste the Agent brief). Set `status: building`, then `done` when every Acceptance box is checked and verification passes.
4. **Re-index** — run `npm run proposals:index` after status changes.

## Tooling

- `npm run proposals:seed` — bootstrap proposals from `../docs/reviews/maturation/`. **Idempotent and non-destructive**: it only creates files that don't exist yet, so it never overwrites a shaped proposal. Re-run after a new maturation pass to pick up new packages.
- `npm run proposals:index` — regenerate [`index.md`](index.md) from frontmatter (run after editing statuses).

## Granularity

One file per package. Bronze / Silver / Gold are scoped _within_ the file (the `tier:` frontmatter field plus the checklist under "Scope"); you hand an agent the file **and a target tier**. Build a tier, check it, advance `tier:` to the next.
