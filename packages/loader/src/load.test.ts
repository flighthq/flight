import { describe, expect, it } from 'vitest';

import { loadBytes, loadText } from './load';

const host = (response: any) => ({ net: { http: { sendNetRequest: async () => response } } }) as any;
describe('loadBytes', () => {
  it('returns bytes on success', async () => {
    await expect(loadBytes(host({ ok: true, body: new ArrayBuffer(1) }), 'u')).resolves.toBeInstanceOf(Uint8Array);
  });
});
describe('loadText', () => {
  it('returns text on success', async () => {
    await expect(loadText(host({ ok: true, body: 'ok' }), 'u')).resolves.toBe('ok');
  });
});
