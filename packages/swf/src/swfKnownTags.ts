// SWF reserves ten bits for a tag code, while the vocabulary this importer knows currently ends at 94.
// Three masks keep the parser's known-vs-unknown diagnostic independent of the human-readable names the
// explain entry needs, so importing a document does not retain every tag name merely to ask membership.
export function isKnownSwfTag(code: number): boolean {
  if (code < 0 || code > 94) return false;
  return (SWF_KNOWN_TAG_MASKS[code >>> 5] & (1 << (code & 31))) !== 0;
}

const SWF_KNOWN_TAG_MASKS: readonly number[] = [0x15fefff7, 0xff016abf, 0x6fdc7fe7];
