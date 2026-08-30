import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHost } from './webHost';
import { webShareContentBackend, webShareFilesBackend } from './webShare';

afterEach(() => vi.unstubAllGlobals());

describe('Web Share providers', () => {
  it('are Entity-composed and exposed through their honest host slots', () => {
    expect(EntityRuntimeKey in webShareContentBackend).toBe(true);
    expect(EntityRuntimeKey in webShareFilesBackend).toBe(true);
    expect(webHost.share).toEqual({ content: webShareContentBackend, files: webShareFilesBackend });
  });

  it('shares title, text, and URL without accepting Capacitor chooser options', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const content = { text: 'hello', title: 'Flight', url: 'https://flight.dev' };
    expect(webShareContentBackend.canShareContent(content)).toBe(true);
    expect(await webShareContentBackend.shareContent(content)).toBe(true);
    expect(share).toHaveBeenCalledWith(content);
    // @ts-expect-error chooserTitle belongs only to the concrete Capacitor provider
    expect(await webShareContentBackend.shareContent(content, { chooserTitle: 'Choose' })).toBe(true);
  });

  it('converts portable data-URL files at the Web provider boundary', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const descriptor = { dataUrl: 'data:text/plain;base64,SGk=', mimeType: 'text/plain', name: 'hi.txt' };
    expect(webShareFilesBackend.canShareContent({ files: [descriptor] })).toBe(true);
    expect(await webShareFilesBackend.shareContent({ files: [descriptor] })).toBe(true);
    const sent = share.mock.calls[0]?.[0] as ShareData;
    expect(sent.files?.[0]).toBeInstanceOf(File);
    expect(sent.files?.[0]?.name).toBe('hi.txt');
  });

  it('reports browser cancellation as a dismissed detailed outcome', async () => {
    const error = new Error('cancelled');
    error.name = 'AbortError';
    vi.stubGlobal('navigator', { share: async () => Promise.reject(error) });
    expect(await webShareContentBackend.shareContentWithResult({ text: 'x' })).toEqual({
      activityType: null,
      completed: false,
      dismissed: true,
    });
  });

  it('returns failure outcomes when the browser API is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect(webShareContentBackend.canShareContent({ text: 'x' })).toBe(false);
    expect(await webShareContentBackend.shareContent({ text: 'x' })).toBe(false);
    expect(await webShareContentBackend.shareContentWithResult({ text: 'x' })).toEqual({
      activityType: null,
      completed: false,
      dismissed: false,
    });
  });

  it('rejects declared-but-empty content before calling the browser', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const empty = { text: '' } as const;
    expect(webShareContentBackend.canShareContent(empty)).toBe(false);
    expect(await webShareContentBackend.shareContent(empty)).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });
});
