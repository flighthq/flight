import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHost } from './webHost';
import {
  initializeWebShareContentBackend,
  initializeWebShareFilesBackend,
  webHostShareContent,
  webHostShareFiles,
} from './webShare';

afterEach(() => vi.unstubAllGlobals());

describe('initializeWebShareContentBackend', () => {
  it('is the construction initializer of createWebShareContentBackend', () => {
    expect(typeof initializeWebShareContentBackend).toBe('function');
  });
});
describe('initializeWebShareFilesBackend', () => {
  it('is the construction initializer of createWebShareFilesBackend', () => {
    expect(typeof initializeWebShareFilesBackend).toBe('function');
  });
});

describe('Web Share providers', () => {
  it('are Entity-composed and exposed through their honest host slots', () => {
    expect(EntityRuntimeKey in webHostShareContent).toBe(true);
    expect(EntityRuntimeKey in webHostShareFiles).toBe(true);
    expect(webHost.share).toEqual({ content: webHostShareContent, files: webHostShareFiles });
  });

  it('shares title, text, and URL without accepting Capacitor chooser options', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const content = { text: 'hello', title: 'Flight', url: 'https://flight.dev' };
    expect(webHostShareContent.canShareContent(content)).toBe(true);
    expect(await webHostShareContent.shareContent(content)).toBe(true);
    expect(share).toHaveBeenCalledWith(content);
    // @ts-expect-error chooserTitle belongs only to the concrete Capacitor provider
    expect(await webHostShareContent.shareContent(content, { chooserTitle: 'Choose' })).toBe(true);
  });

  it('converts portable data-URL files at the Web provider boundary', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const descriptor = { dataUrl: 'data:text/plain;base64,SGk=', mimeType: 'text/plain', name: 'hi.txt' };
    expect(webHostShareFiles.canShareContent({ files: [descriptor] })).toBe(true);
    expect(await webHostShareFiles.shareContent({ files: [descriptor] })).toBe(true);
    const sent = share.mock.calls[0]?.[0] as ShareData;
    expect(sent.files?.[0]).toBeInstanceOf(File);
    expect(sent.files?.[0]?.name).toBe('hi.txt');
  });

  it('reports browser cancellation as a dismissed detailed outcome', async () => {
    const error = new Error('cancelled');
    error.name = 'AbortError';
    vi.stubGlobal('navigator', { share: async () => Promise.reject(error) });
    expect(await webHostShareContent.shareContentWithResult({ text: 'x' })).toEqual({
      activityType: null,
      completed: false,
      dismissed: true,
    });
  });

  it('returns failure outcomes when the browser API is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect(webHostShareContent.canShareContent({ text: 'x' })).toBe(false);
    expect(await webHostShareContent.shareContent({ text: 'x' })).toBe(false);
    expect(await webHostShareContent.shareContentWithResult({ text: 'x' })).toEqual({
      activityType: null,
      completed: false,
      dismissed: false,
    });
  });

  it('rejects declared-but-empty content before calling the browser', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const empty = { text: '' } as const;
    expect(webHostShareContent.canShareContent(empty)).toBe(false);
    expect(await webHostShareContent.shareContent(empty)).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });
});
