const PROGRESS_FRAME_END = '\u001f';
const PROGRESS_FRAME_NAMESPACE = 'flight-check-progress-v1';
const PROGRESS_FRAME_START = '\u001e';

export const CHECK_PROGRESS_TOKEN_ENV = 'FLIGHT_CHECK_PROGRESS_TOKEN';

export interface RegistrarProgressRecord {
  packageName: string;
  registrar: string;
  type: 'registrar';
}

export interface ProgressDecodeResult {
  ordinary: string;
  records: readonly RegistrarProgressRecord[];
}

// The checker creates a fresh random token for this one reachability gate and passes it through the
// environment. The namespace alone is never a marker: a frame is removed only when its capability token,
// terminator, canonical base64url payload, and record schema all validate.
export function createRegistrarProgressFrame(record: RegistrarProgressRecord, token: string): string {
  const payload = Buffer.from(JSON.stringify(record)).toString('base64url');
  return `${progressFramePrefix(token)}${payload}${PROGRESS_FRAME_END}`;
}

export class RegistrarProgressDecoder {
  readonly #prefix: string;
  #pending = '';

  constructor(token: string) {
    this.#prefix = progressFramePrefix(token);
  }

  push(chunk: string): ProgressDecodeResult {
    const ordinary: string[] = [];
    const records: RegistrarProgressRecord[] = [];
    let remaining = this.#pending + chunk;
    this.#pending = '';

    for (;;) {
      const frameStart = remaining.indexOf(this.#prefix);
      if (frameStart === -1) {
        const retained = matchingPrefixSuffixLength(remaining, this.#prefix);
        const ordinaryEnd = remaining.length - retained;
        if (ordinaryEnd > 0) ordinary.push(remaining.slice(0, ordinaryEnd));
        if (retained > 0) this.#pending = remaining.slice(ordinaryEnd);
        break;
      }

      if (frameStart > 0) ordinary.push(remaining.slice(0, frameStart));
      const payloadStart = frameStart + this.#prefix.length;
      const frameEnd = remaining.indexOf(PROGRESS_FRAME_END, payloadStart);
      if (frameEnd === -1) {
        this.#pending = remaining.slice(frameStart);
        break;
      }

      const candidate = remaining.slice(frameStart, frameEnd + PROGRESS_FRAME_END.length);
      const record = decodeRegistrarProgressRecord(remaining.slice(payloadStart, frameEnd));
      if (record === null) ordinary.push(candidate);
      else records.push(record);
      remaining = remaining.slice(frameEnd + PROGRESS_FRAME_END.length);
    }

    return { ordinary: ordinary.join(''), records };
  }

  finish(): string {
    const pending = this.#pending;
    this.#pending = '';
    return pending;
  }
}

function decodeRegistrarProgressRecord(payload: string): RegistrarProgressRecord | null {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(payload, 'base64url');
  } catch {
    return null;
  }
  if (decoded.toString('base64url') !== payload) return null;

  let value: unknown;
  try {
    value = JSON.parse(decoded.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Partial<RegistrarProgressRecord>;
  if (record.type !== 'registrar' || typeof record.packageName !== 'string' || typeof record.registrar !== 'string') {
    return null;
  }
  return { packageName: record.packageName, registrar: record.registrar, type: 'registrar' };
}

function matchingPrefixSuffixLength(value: string, prefix: string): number {
  const maximum = Math.min(value.length, prefix.length - 1);
  for (let length = maximum; length > 0; length -= 1) {
    if (value.endsWith(prefix.slice(0, length))) return length;
  }
  return 0;
}

function progressFramePrefix(token: string): string {
  return `${PROGRESS_FRAME_START}${PROGRESS_FRAME_NAMESPACE}:${token}:`;
}
