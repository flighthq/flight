# flight-image-codec

Image format sniffing and host-capability decode/encode dispatch. Async seams are executor-neutral
D15 futures; no native codecs or host implementations live here.

## Precision

- `ImageEncodeOptions.quality` is `f32` (a normalized [0,1] hint, D1 default); dimensions are
  `usize`; no other floating-point values are contracted.
