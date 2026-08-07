// The CFF DICT: operands first, then the operator that consumes them.
//
// It is the reverse of most bytecode and that inversion is the whole reading rule — values accumulate
// until an operator byte arrives, which claims everything gathered so far. Operators are one byte, except
// that byte 12 introduces a second byte, so escaped operators are keyed here as `1200 + second`.
//
// Only the operators this package needs are named; the rest are read and kept as raw entries, because a
// DICT must be traversed completely to find the operators that matter and skipping an unknown one by
// guesswork would desynchronise everything after it.
//
// The encodings below are interface facts about the format. The reader is Flight's own.

// Top DICT: where the charstrings live, and where the private DICT is.
export const CFF_OPERATOR_CHARSTRINGS = 17;
// Two operands: the private DICT's size, then its offset from the start of the table.
export const CFF_OPERATOR_PRIVATE = 18;
// Private DICT: local subroutines, offset from the start of the private DICT itself.
export const CFF_OPERATOR_SUBRS = 19;
// Top DICT: present only on CID-keyed fonts, whose charstrings are reached through an FDSelect/FDArray
// indirection this package does not read. Its presence is what makes such a font detectable rather than
// silently mis-parsed.
export const CFF_OPERATOR_ROS = 1230;
export const CFF_OPERATOR_FD_ARRAY = 1236;
export const CFF_OPERATOR_FD_SELECT = 1237;

// Operator key → the operands that preceded it. Returns the null sentinel when the byte stream ends
// mid-number or holds a reserved value, since either means the offsets read from it would be arbitrary.
export function readCffDict(bytes: Readonly<Uint8Array>, start: number, end: number): Map<number, number[]> | null {
  const dict = new Map<number, number[]>();
  const operands: number[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = start;

  while (cursor < end) {
    const b0 = view.getUint8(cursor);

    if (b0 <= 21) {
      cursor += 1;
      let key = b0;
      if (b0 === 12) {
        if (cursor >= end) return null;
        key = 1200 + view.getUint8(cursor);
        cursor += 1;
      }
      dict.set(key, operands.splice(0, operands.length));
      continue;
    }

    // 28 and 29 are sized integers; 30 is a real number in packed nibbles; 32-254 encode small integers
    // directly. 22-27 and 31 are reserved and their presence means this is not a DICT.
    if (b0 === 28) {
      if (cursor + 3 > end) return null;
      operands.push(view.getInt16(cursor + 1));
      cursor += 3;
    } else if (b0 === 29) {
      if (cursor + 5 > end) return null;
      operands.push(view.getInt32(cursor + 1));
      cursor += 5;
    } else if (b0 === 30) {
      const real = readCffRealOperand(view, cursor + 1, end);
      if (real === null) return null;
      operands.push(real.value);
      cursor = real.cursor;
    } else if (b0 >= 32 && b0 <= 246) {
      operands.push(b0 - 139);
      cursor += 1;
    } else if (b0 >= 247 && b0 <= 250) {
      if (cursor + 2 > end) return null;
      operands.push((b0 - 247) * 256 + view.getUint8(cursor + 1) + 108);
      cursor += 2;
    } else if (b0 >= 251 && b0 <= 254) {
      if (cursor + 2 > end) return null;
      operands.push(-(b0 - 251) * 256 - view.getUint8(cursor + 1) - 108);
      cursor += 2;
    } else {
      return null;
    }
  }
  return dict;
}

// Real numbers are packed two nibbles per byte, each nibble a digit or one of a few markers, terminated
// by 0xf. Parsed into a string and converted once rather than accumulated arithmetically, because the
// exponent marker can appear before the digits it applies to.
function readCffRealOperand(
  view: Readonly<DataView>,
  start: number,
  end: number,
): { cursor: number; value: number } | null {
  let text = '';
  let cursor = start;
  for (;;) {
    if (cursor >= end) return null;
    const byte = view.getUint8(cursor);
    cursor += 1;
    for (const nibble of [byte >> 4, byte & 0x0f]) {
      if (nibble <= 9) text += String(nibble);
      else if (nibble === 0x0a) text += '.';
      else if (nibble === 0x0b) text += 'E';
      else if (nibble === 0x0c) text += 'E-';
      else if (nibble === 0x0e) text += '-';
      else if (nibble === 0x0f) {
        const value = Number(text);
        return Number.isFinite(value) ? { cursor, value } : null;
      }
      // 0x0d is reserved and carries no digit; skipping it keeps the nibble stream aligned.
    }
  }
}
