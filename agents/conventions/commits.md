# Commit Messages

Read this before writing a commit. It encodes which prefixes are valid and, more importantly, the one rule that makes the rest fall into place: **type answers _what kind of change_; scope answers _where_.** Most prefix confusion is a "where" word (`rust`, `wasm`, `script`, `tool`) sitting in the type slot, where it does not belong.

## Format

```
type(scope): subject
```

Conventional Commits. The `type` is a small closed set. The `scope` is the package/crate or area the change lives in. Subject is imperative, lowercase, no trailing period.

## Types — what kind of change

A closed set. The type is never a language, target, or location.

| type       | use for                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `feat`     | a new capability or API                                                   |
| `fix`      | a bug fix                                                                 |
| `docs`     | documentation only — including `agents/**` and any `CLAUDE.md` |
| `refactor` | restructure or rename with no behavior change                             |
| `test`     | tests only — unit, parity, conformance, functional baselines              |
| `perf`     | a performance change                                                      |
| `build`    | manifests and dependencies — `package.json`, `Cargo.toml`, build targets  |
| `ci`       | CI configuration and workflows                                            |
| `style`    | formatting only, e.g. a repo-wide `npm run fix` sweep                     |
| `chore`    | maintenance that fits nothing above                                       |
| `revert`   | a revert                                                                  |

That is the whole list. If a word you want is not here, it is almost certainly a **scope**, not a type.

## Scope — where the change lives

Use the **short package/crate name** — the same identity the codebase map uses. TS `@flighthq/bitmap` reduces to `bitmap`; the not-yet-renamed Rust `flighthq-surface` crate still reduces to `surface`. Cross-cutting buckets take the area as scope:

```
feat(surface): …          fix(render-wgpu): …       refactor(node): …
feat(tools/parity): …     chore(tools/agents): …    ci(size): …       build(deps): …
```

A repo-wide change takes **no scope**:

```
style: apply npm run fix
refactor: rename Foo across packages
```

## The Rust↔TS axis is a scope namespace, not a type

TS packages and Rust crates share names 1:1, so a bare `feat(surface):` is ambiguous once histories merge. Encode the implementation as a scope prefix:

```
feat(rust/surface): port surface blit ops to tiny-skia
fix(ts/render-webgl): correct premultiply in blend path
docs(rust): document the parity matrix cells
```

- Inside the `rust` worktree, `rust/` is the default; drop it only if these commits will never share a log with TS work. Explicit is cheap and greppable — prefer it.
- **`wasm` is a target inside a crate, not a prefix of its own** → `feat(rust/host-web): …` for the code, `build(wasm): …` for build config.
- Porting a TS feature to Rust is a `feat(rust/<crate>): …` — from the crate's perspective the capability is new, even though TS already had it.

## Breaking changes

Pre-1.0, APIs are reshaped freely (see the codebase map's API philosophy). Still flag a break with `!` so the conformance map and any future tooling can see it:

```
feat(surface)!: repack color as packed RGBA
```

## Single-line only

Commit messages are the subject line and nothing else — no body, no multi-paragraph descriptions, no `Co-Authored-By` or other trailers. If a change needs more explanation, split it into smaller commits whose subjects are self-explanatory.

## A SHA is not a durable handle — check content, not commit

**To decide whether a change landed, grep for its content. Do not reason from a commit identifier.**

A SHA names a revision, not a change. Rebasing mints a new one for the same work — which is routine here,
since every agent applies a moving base — so the identifier someone reported can name a revision that
exists nowhere you can reach while the work itself is present and correct. `git merge-base --is-ancestor`
returning false is therefore **not** evidence of absence, and neither is a failed `git show`.

The two failure modes are mirror images, and both have happened:

- **Concluding work landed when it did not.** A diffstat showed the expected file changed by 41 lines, so
  the change was assumed present. The lines were someone else's. Had it been believed, the real patch
  would have been skipped as already-applied and never looked for again.
- **Concluding work was lost when it was not.** A fix was announced at a SHA that matched no known
  revision, and two people nearly recorded real work as lost. It had landed under a different hash with
  its content intact.

A line count is not identity and a hash is not content. What survives a rebase is the text of the change,
so that is what answers the question people actually mean by "did it land":

    git grep -n "<distinctive phrase from the change>"

Three people derived this rule independently on the same day from different directions, which is why it is
recorded here rather than left to be rediscovered. The full incidents are in
[inert-gate-audit](../inert-gate-audit.md).

## Enforcement

These rules are enforced, not just documented. `commitlint.config.js` at the repo root encodes the type set and scope rules above; a husky `commit-msg` hook (`.husky/commit-msg`) runs `commitlint` on every commit. The hook is registered by the `prepare` script on `npm install` — if hooks ever stop firing, run `npx husky` once to re-register. To check a message by hand: `echo "feat(surface): …" | npx commitlint`.

## A change to what a number counts is never a rename

**It is its own commit, with a subject that says the meaning moved.** A rename that also changes which
things a field counts is two changes wearing one subject, and the mechanical half is the one the
subject advertises.

This matters because **commit subjects are the identity mechanism** here — hashes do not survive
`git am`, so agents cite work by subject line. **A commit whose subject names a mechanical change and
whose content changes a meaning is precisely that mechanism's blind spot:** every reader who looks it
up is told a rename happened, and the denominator that moved underneath is invisible at exactly the
moment someone is checking. **The remedy is not "write better subjects"** — a subject cannot carry a
change the author has not separated out. Split the commit, and the reader who greps for the rename
still finds the meaning change beside it.

**The two halves compose, and the order is fixed.** Commit one renames **and migrates every call
site**, leaving the tree green throughout. Commit two changes what the field counts. **Split by
meaning, never by mechanism:** a rename separated from the sites that read it is not a smaller commit,
it is a broken one.

### Green at every commit is load-bearing here, not tidy

In an ordinary repository a broken intermediate commit is invisible — the branch merges as a unit and
nobody ever checks out the middle. **Agent work is delivered commit by commit**, so an intermediate
state that never existed for its author can become the base every other agent builds on. That has
already happened: a rename shipped without its call-site migration and the delivered base failed
`typecheck` for everyone.

⇒ **"Small atomic commits" here means GREEN, not SMALL.** Splitting a change into more commits makes
things worse whenever the extra seams are red. **Before splitting, ask whether each half compiles on
its own; if one does not, it is not a seam.**

**And atomic also means the diffstat is legible enough that a missing piece shows.** A scripted edit
that silently failed stayed invisible **only because it rode in a commit with a second, unrelated
change**: alone, it would have produced an empty diff and failed loudly. ⇒ **Batching made the
failure representable.**

**So read the diffstat as a completion check — but it only works against a STATED expectation.** *One
insertion* is unremarkable until someone expected a paragraph. **Say what the commit should contain
before you look at what it did**, or the diffstat confirms whatever happened.

### If a mechanical fix offers a choice, it is not mechanical

A repair that is genuinely mechanical has **exactly one correct form**. When the "obvious one-line
fix" presents two or three candidate spellings — `verifiedFixtureFiles`, `metadataFiles`, or their
sum — **the choice is the tell that a meaning is in play and the change is not mechanical at all.**

**This is a local test and needs no outside data.** It fires from inside the position of whoever hits
the broken build, before they know which figure any consumer used, and it is cheaper than the caution
that otherwise has to substitute for it: **stop and route it to whoever owns the meaning.**

### A migration that updates test doubles is never mechanical

**When a type gains a required field, every construction site becomes a semantic decision — including
every test double.** The compiler forces a value at each one, and **being forced to supply a value is
not the same as the value being determined.** ⇒ **"It typechecks" is not evidence the number is
right.**

This is the previous rule seen from the other side: there, the tool offered a choice; here, the tool
*demands* one. **Both feel mechanical because the compiler is driving, and in both the author is
deciding.** A double carrying a plausible-looking value can move behaviour that no type error will
ever flag — a shard plan, a threshold, an exit status.

**So a migration commit that touches fixtures owes a line on what each new value means**, and when
such a migration breaks a behavioural assertion, **read the doubles before escalating to whoever owns
the real numbers**: the fixture branch is far more likely and needs no ruling from them.

**And one notch worse than either: a construction site the compiler never sees at all.** When a type
crosses a JSON boundary — written with `JSON.stringify`, read back and cast — **the serialized site is
a construction site with no type checking on it.** A rename there produces **zero errors**, the field
silently reads back `undefined`, and **nothing in the toolchain can flag it.**

⇒ **These are exactly the sites that reach delivery green.** A migration is not complete when the
compiler stops complaining; **it is complete when every construction site is accounted for, including
the ones on disk.** Grep for the old field name across data files and fixtures, not only across
source.

**Where a value must be supplied, determine it rather than choose it**: read what the old value meant
at that site and preserve it. A fixture writing exactly one corpus file and no metadata maps `files:
1` onto `verifiedFixtureFiles: 1, metadataFiles: 0` — **read off the fixture, not picked** — and
**confirm it is load-bearing by supplying a wrong value and watching the same assertion fail.**

## Picking type vs scope

Two questions, in order:

1. **Did I add behavior, fix a bug, restructure, or just move docs/tests/config?** → the **type**.
2. **Which crate, package, or area?** → the **scope**.

If you find yourself wanting `rust:`, `wasm:`, `script:`, or `tool:` as the type, you answered question 2 in question 1's slot. Move it into the scope: `chore(scripts):`, `feat(tools/<name>):`, `feat(rust/<crate>):`.
