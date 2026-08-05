# SWF JPEG Alpha Import Proposal

_Proposal only, investigated 2026-08-05. No implementation is authorized here. In particular, this
record does not choose the pending bitmap-loading contract, add an image-resource kind, or route embedded
images through `@flighthq/image-codec`._

## Recommendation boundary

Do not describe `DefineBitsJPEG3` or `DefineBitsJPEG4` alpha as supported today, and do not append the
compressed alpha bytes to the colour image handed to the Blob loader. The tag contains two different
encodings: a complete encoded colour image followed by a zlib-compressed one-byte-per-pixel alpha plane.
Their concatenation is not a JPEG, PNG, or GIF, whatever MIME type is put on the Blob.

The smallest honest progression has three distinct claims:

1. **retained** — the importer preserves the alpha payload and its relation to the colour image, but the
   rendered image remains opaque;
2. **composed** — after an image decoder returns RGBA pixels, SWF code validates and joins the alpha plane
   into a `Bitmap`, but no generic resource lane is implied; and
3. **resolved** — an explicit caller-driven load pass binds that composed source into every waiting
   texture, with a functional pixel oracle.

Only the first claim is independent of the bitmap-loading ruling, and even that stage is not implemented
by this proposal. The second and third stages wait for a selected resolved-pixel hand-back point. Keeping
those boundaries separate prevents byte retention from being mistaken for visual support and prevents
this proposal from selecting a shared contract by implication.

## What the tags require

Both tags define one bitmap character. After the character id they carry:

- an offset from the end of the offset field to the compressed alpha data;
- for `DefineBitsJPEG4`, a two-byte authored deblocking parameter included before the colour bytes;
- one bounded encoded colour image; and
- the remaining tag bytes as a zlib-compressed alpha plane.

The offset is what makes the two payloads independently bounded. In JPEG4 it includes the two deblocking
bytes, so the colour range begins after that parameter while the alpha range still begins at the declared
offset. A valid alpha decode must produce exactly `width * height` bytes. Alpha byte `i` belongs to colour
pixel `i`; it replaces the decoded pixel's alpha channel rather than multiplying an existing channel.

Flight's current image-header reader accepts JPEG, PNG, or GIF magic in the colour range shared by
`DefineBitsJPEG2` through `4`. A later alpha implementation must either preserve that existing accepted
set or deliberately narrow it with corpus evidence. The tag's name alone is not evidence that every file
the importer already accepts contains JPEG bytes.

One character may feed several texture variants because sampling is per use. Composition must therefore
happen once per character definition and bind one resulting source to all of the character's waiting
textures. Decoding once per placement would turn authored reuse into repeated allocation and violate the
existing image-resource contract.

## What the importer does today

At reachable Flight source commit `a3707655f`, `readSwfEmbeddedImageDefinition` already performs the
structural half correctly:

- it reads the alpha offset from a bounded tag body;
- it skips the JPEG4 deblocking parameter before identifying the colour image;
- it rejects an offset before the colour start or after the tag end;
- it scans only the colour range for JPEG/PNG/GIF dimensions; and
- it emits only those colour bytes on an `EmbeddedImageResourceReference`.

The alpha range and JPEG4 parameter are then discarded. `loadScene2DImageResources` resolves the retained
colour bytes through `loadImageResourceFromBytes`, which returns a host-backed `Image` after
`HTMLImageElement.decode()`. No raw RGBA value returns to SWF code, so there is nowhere to install the
separate alpha plane. The image consequently resolves and renders as fully opaque.

The DOM-free neighbor has the missing *value* but not the missing *routing*. `@flighthq/image-codec`
returns a straight-RGBA `DecodedImage` from a MIME-keyed decoder, while the existing resource resolver
returns a host-backed `Image`. `Bitmap` can carry the composed RGBA bytes and declare whether they are
straight or premultiplied, but neither 2D nor 3D resource loading currently hands decoded pixels to a
container-specific composer.

The current result is therefore exact:

| Concern | Current result |
| --- | --- |
| colour/alpha boundary | validated |
| colour dimensions and MIME type | retained |
| colour bytes | emitted as an embedded image reference |
| compressed alpha bytes | discarded |
| JPEG4 deblocking parameter | discarded |
| colour decode | browser `Image` path |
| rendered alpha | opaque |

## Vocabulary the feature would need

The SWF-owned data can be named without deciding the shared route. If opaque preservation is authorized,
the full import report would carry contract-only `SwfJpegAlphaPayload` records in
`@flighthq/types/contract`, each with:

- `characterId` — the definition that owns both halves;
- `compressedAlphaBytes` — a zero-copy view of the zlib payload;
- `deblockingParameterRaw` — the authored JPEG4 field's exact 16 bits, or `null` for JPEG3; retaining
  it does not choose a signed fixed-point interpretation;
- `width` and `height` — the dimensions the alpha plane must match; and
- `reference` — the exact `EmbeddedImageResourceReference` carrying the colour bytes and waiting
  textures.

That is importer evidence, not a new generic image resource. It belongs beside `SwfDocumentImport`'s
existing format-specific appearance report and does not put SWF fields on `Scene2DDocument`.

Once a ruling supplies decoded straight RGBA, one SWF-owned pure composition primitive is sufficient:

```ts
createSwfJpegAlphaBitmap(
  decoded: Readonly<DecodedImage>,
  payload: Readonly<SwfJpegAlphaPayload>,
): Bitmap | null
```

Its contract would be narrow:

1. require decoded dimensions to equal the retained dimensions;
2. resolve the registered `Compression.Deflate` decompressor and require exactly `width * height` alpha
   bytes;
3. copy the decoded RGBA once, replacing every fourth byte with the corresponding alpha byte; and
4. return an `rgba8unorm`, sRGB-gamut `Bitmap` with `alphaType: 'straight'`.

Straight alpha is the non-lossy intermediate: `DecodedImage` explicitly returns RGB independent of alpha,
and installing the authored alpha preserves that relation. If a chosen renderer path needs premultiplied
bytes, the existing explicit alpha conversion can run afterward. Requesting premultiplied decode first
and then replacing alpha would be wrong because the RGB channels would have been multiplied by the
decoder's old alpha rather than the SWF plane.

The function name and record shape above specify the SWF vocabulary only. They do not decide who calls
the composer or how its `Bitmap` crosses a generic resource boundary.

## Shared-contract options, deliberately unchosen

### Option A — decoded-image hand-back in the existing embedded lane

Route `EmbeddedImageResourceReference` decoding through the MIME-keyed image-codec registry and introduce
an explicit decoded-pixel composition seam before a resolved texture source is bound. The SWF record would
identify the composer for its reference without putting SWF fields into the generic decoder.

This could unify encoded images, alpha JPEGs, and SWF-lossless pixels behind one caller-driven load pass,
and it gives headless/native hosts the same decoder registration point. It also changes the hottest image
lane from `Promise<Image>` to a result capable of carrying `Bitmap`, touches both 2D and 3D resource
loaders, must preserve cancellation/failure/cache semantics, and may change the bundle cost of an ordinary
PNG consumer.

Evidence that would settle it:

- a concrete plain-data composer registration shape with no callback stored on a resource reference;
- equal 2D and 3D lifecycle behavior for embedded and external images;
- straight/premultiplied pixel tests through both renderer source kinds;
- headless decoder coverage; and
- comparison with the pinned `scene2d-embedded-png:canvas` status-quo baseline of **1,864 bytes gzip**,
  measured against the source tree identified by the in-flight subject
  `test: strengthen assertion contracts`, whose replay hash is deliberately not pinned.

### Option B — an additive pixel-backed image-reference kind

Keep Embedded and External resolution returning host-backed `Image`s, and add the anticipated third
`ImageResourceReference` member for a ready `Bitmap`. Both 2D and 3D loaders would learn to bind that
source kind. Eager SWF-lossless pixels could use the same document lane rather than bypassing it.

This preserves the ordinary encoded-PNG graph, but a ready-bitmap member alone does **not** solve JPEG
alpha: the colour bytes still need an asynchronous decoder before the Bitmap exists. The option therefore
also needs an explicit SWF load step that calls the codec, composes the alpha, and fills or replaces the
pixel-backed reference. If the third member instead embeds encoded colour, compressed alpha, and a
format-specific recipe, it ceases to be a generic image reference and leaks SWF vocabulary into shared
types.

Evidence that would settle it:

- a stable identity/lifecycle rule for a reference whose Bitmap is not ready at parse time;
- proof that replacement or fill-in cannot strand textures subscribed to the old identity;
- equal 2D/3D handling and retry/cancellation behavior;
- more than one producer needing the pixel-backed member; and
- size evidence showing that consumers of only Embedded/External references remain at the pinned
  status-quo graph.

### Option C — an explicit SWF-only resolve pass

Leave generic references unchanged and add a caller-invoked `loadSwfJpegAlphaImages` operation over
`SwfDocumentImport`. It would use the registered image decoder and decompressor, compose a Bitmap, and
bind that source to the record's waiting textures. The ordinary `loadScene2DImageResources` pass would
continue to handle every other encoded image.

This is the narrowest cross-package change and makes the format-specific join visibly format-specific.
It also gives SWF two image load passes, duplicates lifecycle/progress/failure policy, and leaves the
broader encoded/lossless asymmetry untouched. A convenience that callers must order correctly can be
more misleading than a larger shared seam unless its ownership is unmistakable.

Evidence that would settle it:

- an operation-order contract that cannot first bind the opaque colour Image and then silently replace it;
- a reason the shared loader's cancellation, retry, progress, and failure vocabulary should not be reused;
- bundle evidence that the SWF-only path remains absent from non-SWF consumers; and
- a second format-specific composition need, or evidence that JPEG alpha is intentionally exceptional.

## Measured scope and its limit

The fixed Ruffle sample and obtain procedure are recorded in the SWF fixture evidence: 306 files sampled
at upstream revision `f8d8de6bb15c3d7a799d7088997422b926c8478c`, of which 301 are readable with the
registered deflate decompressor. At Flight measurement commit
`8dd53f4a24b493182514956cfdc0880d745b729e`:

- `DefineBitsJPEG3` appears in **1 of 301 readable files** — about **0.33%**;
- equivalently, it appears in **1 of all 306 sampled files** — about **0.33%**;
- `DefineBitsJPEG4` does not appear in the recorded tag-frequency table; and
- the corpus contains **784 placement records** overall.

The existing sweep counted files per tag and placement appearance fields. It did **not** record the number
of JPEG3 definitions, the character ids they define, or how many placement records refer to those ids.
Therefore the alpha-bearing placement count and its fraction of 784 are **unknown**. Treating the one
tag-bearing file as one placement would manufacture evidence: a definition may be unused, placed once, or
reused many times.

Before any pixel stage is ranked or authorized, rerun the same revision-pinned corpus with a targeted
counter that records:

- JPEG3 and JPEG4 definition counts;
- valid colour/alpha boundaries and decompressed alpha lengths;
- distinct defined characters ever placed;
- placement records and unique instances referring to those characters; and
- decoded colour dimensions versus alpha-plane lengths.

Pin those results to the Flight commit containing the counter. The current one-file measurement is enough
to prove the gap is real and sparse in this sample; it is not enough to quantify visual prevalence. The
sample is AVM-test-skewed, so even a completed placement fraction would rank this corpus only, not
production SWFs.

## Honest stages and acceptance

### Stage A — opaque alpha preservation

If separately authorized, retain `SwfJpegAlphaPayload` on the full SWF import report. Keep the existing
opaque colour reference and rendering unchanged. Acceptance proves exact zero-copy colour and compressed
alpha ranges for JPEG3 and JPEG4, including the JPEG4 offset base and deblocking value, plus malformed
offset rejection.

Claim: the import report preserves both encoded halves and the raw JPEG4 deblocking field. Do not claim
transparency, decompression, deblocking interpretation, composition, or pixel support.

### Stage B — pure pixel composition

Only after a resolved-image route is selected, implement `createSwfJpegAlphaBitmap`. Exercise real deflate,
dimension mismatch, short/long alpha planes, straight-alpha bytes, zero alpha, partial alpha, and full
alpha. Mutation-check the expected pixel oracle by shifting the alpha plane and confirming it fails.

Claim: given correctly decoded colour pixels and a registered decompressor, the primitive produces the
right Bitmap. Do not claim the document loader invokes it or renderers receive it.

### Stage C — resource resolution and visual proof

Wire the selected Option A, B, or C through explicit loading. Decode and compose once per definition,
bind the same source to every waiting sampler texture, preserve cancellation/retry/failure semantics, and
add a functional scene whose pixel oracle distinguishes opaque colour from the authored alpha gradient on
Canvas, DOM, WebGL, and WebGPU.

Claim visual alpha only when that functional oracle and a revision-pinned real-file check both pass.
Applying the alpha to one synthetic texture is not evidence that reused placements, fills, and exported
symbols share the resolved source correctly.

## Work explicitly declined

- **No Blob concatenation.** Encoded colour plus zlib alpha is not a browser image container.
- **No synchronous image decode in parsing.** SWF import remains synchronous and renderer-neutral; heavy
  decode stays in an explicit load operation.
- **No function-valued callback on `ImageResourceReference`.** References are serializable plain data, not
  closures capturing a format parser.
- **No SWF fields on a generic image reference.** Character ids, alpha offsets, and JPEG4 deblocking are
  container facts and stay in the SWF report.
- **No implicit canvas readback.** It is browser-only, can fail on origin cleanliness, allocates a second
  representation, and hides the cost the caller must choose.
- **No bundled decompressor or decoder.** Both remain explicitly registered, tree-shakable capabilities.
- **No guessed JPEG4 deblocking.** Retaining the authored value does not authorize applying it; that needs
  a decoder contract and pixel evidence.
- **No per-placement decode.** One definition resolves once and fans out to all waiting textures.
- **No bitmap-routing decision by wording.** `SwfJpegAlphaPayload` is importer evidence, not endorsement of
  the DecodedImage bridge, a third reference kind, or a SWF-only loader.
- **No claim from presence alone.** Bounds, a non-null source, or a changed pixel count cannot prove the
  alpha plane was aligned and composed correctly; acceptance needs exact RGBA and functional pixels.

## Decision boundary

The committed corpus evidence is sufficient to draft and review this contract, not to choose it. Stage A
can preserve bytes without lying, but its value should be weighed against a measured placement count.
Stages B and C remain blocked on the same resolved-image hand-back ruling as the broader bitmap-loading
fork.

Whichever route is chosen must keep the 1,864-byte non-SWF PNG baseline as its before-number, preserve
one-decode-per-definition sharing, and return a `Bitmap` whose alpha representation is explicit. Until
then, the current opaque colour reference is incomplete but honest, and no implementation should make it
look complete by joining incompatible byte streams or hiding a format-specific decode inside parsing.
