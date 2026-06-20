# Packaging and Publishing

Packaging policy is enforced by `npm run packages:check`, not by memory or hand-tuned manifests. Treat this as orientation for the current package shape, not the source of truth — when policy changes, change the shared scripts and validation, not individual package manifests.

- Packages publish `dist` plus colocated source `*.test.ts` files. Tests ship intentionally, as examples and AI-readable documentation.
- Compiled test outputs are excluded from published packages.
- `prepack` cleans TypeScript build state, removes the package's `dist` via `clean:dist`, and rebuilds, so stale renamed files are never published.
