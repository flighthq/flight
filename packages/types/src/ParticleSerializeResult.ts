/** The result of a particle-format serialize operation.
 *
 *  `text` is the serialized format string. `warnings` lists features present in
 *  the source config that the target format cannot represent and were silently
 *  dropped or approximated — surface these in your asset pipeline to audit export
 *  fidelity. An empty `warnings` array means the export is lossless for the
 *  features the target format supports. */
export interface ParticleSerializeResult {
  /** The serialized format string. */
  readonly text: string;
  /** Features in the config that the target format cannot represent and were
   *  dropped or approximated during serialization. */
  readonly warnings: string[];
}
