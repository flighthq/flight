---
package: '@flighthq/share'
status: solid
score: 90
updated: 2026-08-29
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
  - host-capacitor
  - host-web
---

# share — Review

## Verdict

**Solid — 90/100.** Share is an explicit Host capability with separate content and portable-file
slots. Content is realized by Web and Capacitor; portable data-URL files are claimed only by Web.
Capability absence is a missing slot, while `canShareContent` validates a meaningful payload inside a
present slot. Core result signals and both provider implementations are Entity-composed.

## What is solid

- `ShareContent` requires a title, text, or URL vector at compile time; runtime validation rejects
  declared empty strings before dispatch.
- `ShareFilesContent` requires a non-empty portable-file tuple, and the convenience entry point rejects
  an empty array before dispatch.
- The Web provider maps title/text/URL directly and converts portable data URLs to DOM `File` objects
  at its host boundary. Browser rejection resolves to boolean or detailed failure outcomes.
- The Capacitor provider realizes title/text/URL immediately, without construction-time async cache or
  availability gate. Its chooser hint exists only on the concrete provider extension.
- `shareContentWithResult` preserves activity information and emits the core-owned result signal only
  to explicitly attached signal Entities. Disposal detaches and clears listeners.
- Two simultaneous Host values route independently; no module state chooses a provider for a call.

## Remaining depth

- Web can identify `AbortError`, while the injected Capacitor facade cannot distinguish cancellation
  from other rejected native commands.
- Capacitor accepts platform file URIs, but Flight's portable descriptor is a data URL. Native file
  sharing remains absent until a staging/cleanup or multi-representation contract is justified.

## Boundary conclusion

The capability shape now tells the truth: provider presence is structural, runtime rejection is an
outcome, and provider-specific chooser presentation cannot leak into portable Web calls.
