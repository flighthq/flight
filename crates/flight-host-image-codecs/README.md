# flight-host-image-codecs

`flight-host-image-codecs` is Flight's opt-in, Rust-only PNG and JPEG service. It is a workspace
member outside `default-members`, so a root default build does not resolve or compile its codec
backings. It is outside `flight-sdk` and has no FFI or aggregate-native feature.

## Capability fit

The existing `flight-image-codec` format slot owns an async closure. Decode receives owned encoded
bytes plus optional premultiplication and returns owned row-major RGBA8 pixels. Encode receives an
owned RGBA8 image plus an optional normalized quality hint and returns owned encoded bytes. Both
backings fit those success shapes without adapters or native state.

The current Rust capability futures have success-only output types, unlike JavaScript promises,
which can reject malformed input. This host does not panic or add a second capability shape. A
failed capability call returns a host-reserved sentinel: decode returns zero dimensions and no
pixels (PNG and JPEG successes are always nonzero); encode returns no bytes. The direct host functions expose the same failures as
`None`, and `explain_image_codecs_host_decode` / `explain_image_codecs_host_encode` re-run the
bounded operation to distinguish malformed input, invalid options/layout, unavailable formats,
resource limits and destroyed state. No error is stored globally or in a racy last-error slot.

| Capability slot | Filled | Backing and behavior |
| --- | --- | --- |
| decode `png` | `png` feature | `png` 0.17; expands palette/grayscale/RGB to RGBA8, strips 16-bit samples, optionally premultiplies |
| decode `jpeg` | `jpeg` feature | `jpeg-decoder` 0.3; expands grayscale/RGB/CMYK to opaque RGBA8 |
| decode `avif`, `bmp`, `gif`, `webp` | no | no first-cut backing |
| encode `png` | `png` feature | `png` 0.17; lossless RGBA8, ignores the lossy quality hint |
| encode `jpeg` | `jpeg` feature | `jpeg-encoder` 0.6; RGB output, alpha discarded, normalized quality mapped to 1–100 |
| encode `webp` | no | no first-cut backing |

Each replaceable external library is named only in its format implementation module and
`Cargo.toml`: PNG in `png_backend.rs`, and the paired JPEG decoder/encoder in `jpeg_backend.rs`.
The default crate features enable both formats; `--no-default-features`, `png`, and `jpeg` builds
remain valid independently.

## Ownership, limits and threads

The host owns its capability records and a shared liveness token. Capability getters borrow the
records. Closures receive owned inputs and produce owned outputs; a retained closure fails closed
after explicit destroy or after the host is dropped. Destroy is idempotent.

Decode and encode are CPU-only and have no thread affinity. Capability closures are `Send + Sync`;
the work runs on whichever thread polls the returned future. No worker, executor, process singleton
or module-level mutable state is created.

Dimensions, pixel count, encoded input length and encoded output length are bounded. Defaults are
16,384 pixels per dimension, 64 million pixels, and 64 MiB encoded input/output. Bounds are checked
before decoded pixel allocation, output is written through a capped writer, and all size
arithmetic is checked.
