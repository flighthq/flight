---
package: '@flighthq/storage'
crate: flighthq-storage
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# storage — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Synchronous persistent key/value storage over a swappable web/native `StorageBackend`, part of the platform-integration suite. The broadest API surface in the OS/device group (39 exports): namespacing, typed scalar accessors (string, number, boolean), JSON serialization, schema migrations, and quota reporting. The web default wraps `localStorage`; native hosts replace via `setStorageBackend`. All reads/writes are synchronous and side-effect-free at import.

## Decisions

- **[2026-07-02] Signal opt-in convention applies.** Per the shared principles, signals (if any) should use `enable*Signals` gates rather than eager allocation. No package-specific exceptions.

## Open directions

- Whether an async storage path (IndexedDB, OPFS, native file-KV) belongs as a second backend method or a separate package.
- Migration strategy complexity vs the current schema-version approach.
