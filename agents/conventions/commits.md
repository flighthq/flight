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

Use the **short package/crate name** — the same identity the codebase map uses. TS `@flighthq/surface` and Rust `flighthq-surface` both reduce to `surface`. Cross-cutting buckets take the area as scope:

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

## Enforcement

These rules are enforced, not just documented. `commitlint.config.js` at the repo root encodes the type set and scope rules above; a husky `commit-msg` hook (`.husky/commit-msg`) runs `commitlint` on every commit. The hook is registered by the `prepare` script on `npm install` — if hooks ever stop firing, run `npx husky` once to re-register. To check a message by hand: `echo "feat(surface): …" | npx commitlint`.

## Picking type vs scope

Two questions, in order:

1. **Did I add behavior, fix a bug, restructure, or just move docs/tests/config?** → the **type**.
2. **Which crate, package, or area?** → the **scope**.

If you find yourself wanting `rust:`, `wasm:`, `script:`, or `tool:` as the type, you answered question 2 in question 1's slot. Move it into the scope: `chore(scripts):`, `feat(tools/<name>):`, `feat(rust/<crate>):`.
