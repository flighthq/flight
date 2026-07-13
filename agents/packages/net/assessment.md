---
package: '@flighthq/net'
updated: 2026-07-13
basedOn: ./review.md
---

# net — Assessment

## Recommended

Sweep-safe, within-package, no design fork:

1. **`explainNetResponse(response)` query** — a shakeable plain-data explainer for the silent sentinels (status 0 → transport failure kind derived from `statusText`; null JSON body → decode failure), per the diagnostics inversion rule. Pure function over `NetResponse`, no new dependency.
2. **`enableNetGuards` module** — opt-in guard warnings through `@flighthq/log` for the misuse surfaces the sentinels currently hide (e.g. a body supplied on GET/HEAD, a negative `timeoutMs`, progress signal with a backend that never emits). Separately importable, costs production nothing.
3. **URL-encoded form body helper** — a small pure `formatNetFormBody(fields): string` (+ the matching `Content-Type` constant) producing a `NetBody` string; no new accepted body types, so it dodges the open `NetBody` type question while covering the most common encoding need.
4. **Test the multi-value header flattening** — pin the current comma-join behavior of `_readNetResponseHeaders` in a test so the known simplification is explicit rather than accidental.
5. **Document/normalize `total` semantics in the no-stream progress fallback** — the fallback tick reports `total = byteLength` when Content-Length is absent while the streaming path reports `0`; make the two paths consistent (0-when-unknown) and test it.

## Backlog

- **Streaming response bodies** (charter Open direction 1) — parked: adds a new `responseType` or option shape to the `@flighthq/types` seam; cross-package (types) and an API-shape decision (stream handle vs chunk callback).
- **Upload progress** — parked: unobservable via fetch; requires an XHR-based web path or native backend commitment. Tied to candidate open direction 3 (whether `phase: 'upload'` stays).
- **Multipart/form-data encoder** (charter Open direction 3) — parked: needs the `NetBody` type decision (binary boundary assembly returns bytes; should `Blob`/`FormData` be accepted?) — surfaced as review open direction 1.
- **Retry/backoff helper** — parked permanently per Boundary; belongs to the composing layer (`assets`/`loader`).

## Approved

_Empty — awaiting the user's verbal gate._
