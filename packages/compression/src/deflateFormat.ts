// Format facts shared by the DEFLATE decoder and encoder. They live here rather than beside either one
// because a second copy is what drifts: the encoder picks a length code from the same table the decoder
// resolves it with, so the two cannot disagree about what a symbol means. Pure data and one pure
// function, with no module-scope initialisation, so importing the encoder never pulls in the decoder.

// RFC 1951 length codes 257-285: the base copy length and the number of extra bits that follow.
export const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
export const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

// RFC 1951 distance codes 0-29: the base back-distance and the number of extra bits that follow.
export const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
export const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

// The RFC 1950 checksum, over the UNCOMPRESSED bytes. Written by the encoder into the zlib trailer and
// re-derived by the decoder to verify it, so one implementation defines both sides of that agreement.
export function computeAdler32(input: Readonly<Uint8Array>): number {
  let first = 1;
  let second = 0;
  for (const byte of input) {
    first += byte;
    if (first >= ADLER_MODULUS) first -= ADLER_MODULUS;
    second += first;
    if (second >= ADLER_MODULUS) second -= ADLER_MODULUS;
  }
  return ((second << 16) | first) >>> 0;
}

const ADLER_MODULUS = 65521;
