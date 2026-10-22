# flight-textbidi

Unicode Bidirectional Algorithm support: bidi-class lookup, embedding-level resolution, logical runs, and visual line reordering.

`resolve_bidi_levels` and `get_bidi_runs` take a required first output vector. They replace its
contents while retaining capacity. Levels remain bytes with one entry per UTF-16 code unit; runs
retain their original logical order and ranges. The explicit kernel callback protocol is unchanged.

## Precision

- This crate has no floating-point contract values; bidi levels, UTF-16 code-unit indices, and Unicode scalar values use integer types.
