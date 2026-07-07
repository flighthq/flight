# shell — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Rename `openExternalUrl` to `openShellExternalUrl`** — the current name omits the `Shell` type word, violating the "exported function names include the full, unabbreviated name of the type they operate on" design constraint. Every other shell export uses the `Shell` prefix; this high-frequency entry point should match.

## Approved

1. **Rename `openExternalUrl` to `openShellExternalUrl`** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
