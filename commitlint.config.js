// Commit-message rules for the Flight monorepo, enforced by the husky
// `.husky/commit-msg` hook (`commitlint --edit`). The authoritative spec for
// these rules is agents/conventions/commits.md — keep them in sync.
//
// Format: `type(scope): subject` (Conventional Commits).
//   - type  = WHAT KIND of change, from the closed set below.
//   - scope = WHERE: the short package/crate name (`surface`, `render-wgpu`) or
//             an area bucket (`tools/parity`, `deps`, `size`). The Rust↔TS axis
//             is a scope namespace, not a type: `rust/<crate>`, `ts/<crate>`.
//             Scopes are intentionally OPEN (not enumerated) so any crate, area,
//             or `rust/`·`ts/`·`tools/*` prefix is valid; a repo-wide change
//             takes no scope.
//   - `!` before the colon flags a breaking change: `feat(surface)!: …`.

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The closed type set from commits.md. A language/target/location word
    // (`rust`, `wasm`, `script`, `tool`) is never a type — it is a scope.
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'refactor',
        'test',
        'perf',
        'build',
        'ci',
        'style',
        'chore',
        'revert',
      ],
    ],
    // Scope is optional (repo-wide changes carry none) and open-ended, but when
    // present it must be lowercase to match crate/package identity.
    'scope-empty': [0],
    'scope-case': [2, 'always', 'lower-case'],
  },
};
