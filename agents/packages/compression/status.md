---
package: '@flighthq/compression'
updated: 2026-08-02
---

# compression status

Built 2026-08-02 by extracting the RFC 1951/1950 inflate that had been living inside
`scene3d-formats/src/awd2Inflate.ts`, once a second consumer (`swf`, for `CWS` bodies) needed the same
decoder. Two cells needing one algorithm is the decomposition smell the codebase map names; this is the
extracted primitive.

- `inflateDeflate` decodes raw DEFLATE and zlib-wrapped streams — stored, fixed-Huffman, and
  dynamic-Huffman blocks — synchronously and with no dependencies. A zlib header is detected and skipped
  when present, so a caller does not have to know which framing its container used.
- `registerDecompressor` / `getDecompressor` / `hasDecompressor` / `unregisterDecompressor` are the one
  registry every container format resolves through. A caller registers an algorithm once and SWF, AWD2,
  and anything added later can all read it, instead of each format owning a private registry keyed by its
  own vocabulary. Last-write-wins, so a host can replace a portable decoder with a native or wasm one.
- Nothing registers at module load. `registerDeflateDecompressor()` is the explicit opt-in, and the codec
  lives in its own module so a build that never decompresses pays for no Huffman decoder.
- The shape follows the cells that already hold several algorithms — `scene3d-formats` (glTF, OBJ/MTL,
  MD2, MD5, 3DS, AWD2) and `image-codec` (a registry plus opt-in registrars). Adding LZMA, zstd, or
  brotli is adding a module, not a package.

Deliberately absent: compression (encoding), which no importer needs, and LZMA, which no consumer can
read yet — `ZWS` is 5 of the 306-file SWF corpus and is the natural first candidate for a wasm registrant
rather than a hand-written TypeScript decoder, since `registerWebImageDecoders` already establishes that
a native host registers wasm codecs instead of calling the portable registrar.
