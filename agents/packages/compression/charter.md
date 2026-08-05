---
package: '@flighthq/compression'
role: package
crate: flighthq-compression
draft: true
lastDirection: null
status: unblessed — cell authored 2026-08-02 alongside the package; pending user ratification
status_doc: ./status.md
---

# @flighthq/compression — Charter (DRAFT)

> **This is an unblessed design draft.** The package name and the decision to collapse the two
> per-consumer decompressor registries into one were user-directed on 2026-08-02; the rest of this
> charter records the shape that followed from them and is not authoritative until blessed.

## What it is

The home for **compressed-byte decoding** and the **one registry every container format resolves
through**. It owns algorithms, not containers: a caller hands it compressed bytes and gets raw bytes
back, with no knowledge of the file that carried them.

It exists because two cells needed the same RFC 1951 decoder — `scene3d-formats` for AWD2's compressed
blocks, `swf` for `CWS` bodies — and duplicating an algorithm across cells is the decomposition smell
[the codebase map](../../../AGENTS.md) names. The inflate was extracted here rather than copied.

## Shape

One cell, several algorithms as separate modules — the same shape as `scene3d-formats` (glTF, OBJ/MTL,
MD2, MD5, 3DS, AWD2) and `image-codec` (a registry plus opt-in registrars), not a package per algorithm.
That shape is what keeps the bundle honest: each codec is its own module behind an explicit `register*`,
so a build that never decompresses pays for none of them. Adding LZMA, zstd, or brotli is adding a
module.

## Boundaries

- **Decode, not encode.** No importer needs to compress. Encoding is a separate question, and a much
  larger one for every algorithm here.
- **Algorithms, not containers.** How a format frames its compressed body — SWF's `CWS`/`ZWS`
  signatures, AWD2's method byte — is that format's business. Consumers map their own vocabulary onto
  `Compression` at their own seam.
- **No vendored third-party library.** The decoders here are Flight's own portable source, which is what
  the TypeScript-canonical port story requires.
- **Registration is explicit.** Nothing registers at module load.

## Open directions

1. **LZMA.** Unimplemented, and the only thing standing between `swf` and the last 5 files of its
   306-file corpus. The natural first candidate for a **Rust/wasm registrant** rather than a
   hand-written TypeScript decoder — `registerWebImageDecoders` already establishes the pattern that a
   native host registers wasm codecs instead of calling the portable registrar. A wasm codec is another
   registrant here, not a rewrite of anything.
2. **Whether a wasm deflate is ever worth it.** The TypeScript inflate is ~250 lines and lowers cleanly
   to Rust/C through the ordinary codegen, so it needs no hand-written native crate. Revisit only on
   measured weight, per the same threshold language the `swf` charter uses.
3. **Encoding, if export is ever chartered.** Stored-only DEFLATE blocks are trivial; competitive ratios
   are not. Not needed until something writes a compressed container.
4. **zstd / brotli**, if a format Flight imports ever carries them.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-02] One `compression` cell, not a package per algorithm; and the two per-consumer
  decompressor registries collapse into one shared registry.** User-directed. A caller registers an
  algorithm once and every container that carries it can read it, rather than registering the same
  function twice under two vocabularies.
