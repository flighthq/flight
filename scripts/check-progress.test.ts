import { describe, expect, it } from 'vitest';

import { createRegistrarProgressFrame, RegistrarProgressDecoder } from './check-progress';

const TOKEN = '00000000-0000-4000-8000-000000000000';

describe('check progress protocol', () => {
  it('decodes fragmented and multiple records while preserving ordinary output order', () => {
    const decoder = new RegistrarProgressDecoder(TOKEN);
    const first = createRegistrarProgressFrame(
      { packageName: 'alpha', registrar: 'registerAlpha', type: 'registrar' },
      TOKEN,
    );
    const second = createRegistrarProgressFrame(
      { packageName: 'beta', registrar: 'registerBeta', type: 'registrar' },
      TOKEN,
    );
    const input = `before ${first} between ${second} after`;
    const ordinary: string[] = [];
    const records: unknown[] = [];

    for (let offset = 0; offset < input.length; offset += 7) {
      const decoded = decoder.push(input.slice(offset, offset + 7));
      ordinary.push(decoded.ordinary);
      records.push(...decoded.records);
    }
    ordinary.push(decoder.finish());

    expect(ordinary.join('')).toBe('before  between  after');
    expect(records).toEqual([
      { packageName: 'alpha', registrar: 'registerAlpha', type: 'registrar' },
      { packageName: 'beta', registrar: 'registerBeta', type: 'registrar' },
    ]);
  });

  it('preserves sentinel text and invalid token-scoped frames as ordinary output', () => {
    const decoder = new RegistrarProgressDecoder(TOKEN);
    const input = [
      'ordinary flight-check-progress-v1 text',
      '\u001eflight-check-progress-v1:some-other-token:not-a-record\u001f',
      `\u001eflight-check-progress-v1:${TOKEN}:not-base64!\u001f`,
    ].join('|');
    const decoded = decoder.push(input);

    expect(decoded.records).toEqual([]);
    expect(decoded.ordinary + decoder.finish()).toBe(input);
  });
});
