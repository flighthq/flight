/**
 * The fixed 12-byte header of one AWD2 file: magic, version, flags, compression method and the
 * on-disk body length.
 *
 * Metadata only, and deliberately separate from what the file *contains* — an inventory is a
 * `RequirementSet` produced by the build-time analyzer, because that answer costs a walk of every
 * block while this one costs a bounded prefix.
 */
export interface Awd2Header {
  /** On-disk length of the body in bytes, as the header declares it. Compressed length when compressed. */
  readonly bodyLength: number;
  /** Compression method byte: 0 none, 1 deflate, 2 lzma. */
  readonly compression: number;
  /** The 16-bit header flags field. */
  readonly flags: number;
  /** Major format version. Only 2 is an AWD2 file; 3 shares the magic but has another block model. */
  readonly versionMajor: number;
  /** Minor format version. */
  readonly versionMinor: number;
}
