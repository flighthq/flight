function isLittleEndian(): boolean {
  const buffer = new ArrayBuffer(2);
  new Uint16Array(buffer)[0] = 0x0102;
  return new Uint8Array(buffer)[0] === 0x02;
}

function record(entries: ReadonlyArray<readonly [string, unknown]>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of entries) out[key] = value;
  return out;
}

function object(entries: ReadonlyArray<readonly [string, unknown]>): unknown {
  return record(entries);
}

function text(value: string): unknown {
  return value;
}

export const rustTestSupport = {
  isLittleEndian,
  object,
  record,
  text,
};
