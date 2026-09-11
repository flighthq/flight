import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { capacitorHostClipboard, capacitorHostClipboardImage, capacitorHostClipboardText } from './capacitorClipboard';

function fakeCapacitor() {
  const store = { value: '', type: 'text/plain' };
  const calls: string[] = [];
  const capacitor = {
    clipboard: {
      async read() {
        calls.push('read');
        return { value: store.value, type: store.type };
      },
      async write(options: { string?: string; image?: string }) {
        calls.push('write');
        if (options.image !== undefined) {
          store.value = options.image;
          store.type = 'image/png';
        } else {
          store.value = options.string ?? '';
          store.type = 'text/plain';
        }
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, store, calls };
}

describe('capacitorHostClipboard', () => {
  it('composes the state-coupled image and text slots from one Entity', () => {
    const clipboard = capacitorHostClipboard(fakeCapacitor().capacitor);
    expect(clipboard.image).toBe(clipboard.text);
    expect(EntityRuntimeKey in clipboard.image).toBe(true);
  });
});

describe('capacitorHostClipboardImage', () => {
  it('round-trips a data-URL image', async () => {
    const hostClipboardImage = capacitorHostClipboardImage(fakeCapacitor().capacitor);
    expect(await hostClipboardImage.writeImage('data:image/png;base64,AAAA')).toBe(true);
    expect(await hostClipboardImage.readImage()).toBe('data:image/png;base64,AAAA');
    expect(await hostClipboardImage.hasImage()).toBe(true);
  });
});

describe('capacitorHostClipboardText', () => {
  it('round-trips text through the Capacitor clipboard', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const hostClipboardText = capacitorHostClipboardText(capacitor);
    expect(EntityRuntimeKey in hostClipboardText).toBe(true);
    expect(await hostClipboardText.writeText('hi')).toBe(true);
    expect(await hostClipboardText.readText()).toBe('hi');
    expect(await hostClipboardText.hasText()).toBe(true);
    expect(calls).toContain('write');
    expect(calls).toContain('read');
  });

  it('resolves sentinels when the clipboard read throws', async () => {
    const capacitor = {
      clipboard: {
        async read() {
          throw new Error('denied');
        },
      },
    } as unknown as CapacitorApi;
    const hostClipboardText = capacitorHostClipboardText(capacitor);
    expect(await hostClipboardText.readText()).toBe('');
    expect(await hostClipboardText.hasText()).toBe(false);
  });
});
