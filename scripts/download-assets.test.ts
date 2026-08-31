import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadAssets } from './download-assets';

describe('downloadAssets', () => {
  let targetDir: string;

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'flight-download-assets-'));
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await rm(targetDir, { force: true, recursive: true });
  });

  it('does not retry permanent HTTP failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadAssets([asset()], targetDir)).rejects.toThrow(
      'Failed to download https://example.test/asset.bin: 404 Not Found',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries retryable HTTP failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    let unrelatedIntervalTicks = 0;
    const unrelatedInterval = setInterval(() => {
      unrelatedIntervalTicks += 1;
    }, 100);

    const complete = downloadAssets([asset()], targetDir);
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(500);
    await complete;
    clearInterval(unrelatedInterval);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(unrelatedIntervalTicks).toBeGreaterThan(0);
    expect(await readFile(join(targetDir, 'asset.bin'))).toEqual(Buffer.from([1, 2, 3]));
  });

  it('retries transient transport failures', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('read ECONNRESET') }))
      .mockResolvedValueOnce(new Response(Uint8Array.from([4, 5, 6])));
    vi.stubGlobal('fetch', fetchMock);

    const complete = downloadAssets([asset()], targetDir);
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(500);
    await complete;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await readFile(join(targetDir, 'asset.bin'))).toEqual(Buffer.from([4, 5, 6]));
  });

  it('stops after four failed attempts', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const completion = expect(downloadAssets([asset()], targetDir)).rejects.toThrow('fetch failed');
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await completion;

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

function asset() {
  return { path: 'asset.bin', url: 'https://example.test/asset.bin' };
}
