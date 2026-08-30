import type { TauriApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { makeTauriShellCapabilities } from './tauriShell';

function fakeTauri(rejection: unknown = NO_REJECTION) {
  const calls: { openUrl: string[]; openPath: string[]; reveal: string[] } = {
    openUrl: [],
    openPath: [],
    reveal: [],
  };
  const guard = async () => {
    if (rejection !== NO_REJECTION) throw rejection;
  };
  const tauri = {
    opener: {
      async openUrl(url: string) {
        calls.openUrl.push(url);
        await guard();
      },
      async openPath(path: string) {
        calls.openPath.push(path);
        await guard();
      },
      async revealItemInDir(path: string) {
        calls.reveal.push(path);
        await guard();
      },
    },
  } as unknown as TauriApi;
  return { tauri, calls };
}

describe('makeTauriShellCapabilities', () => {
  it('constructs exactly three Entity providers', () => {
    const capabilities = makeTauriShellCapabilities(fakeTauri().tauri);
    expect(Object.keys(capabilities).sort()).toEqual(['external', 'pathOpen', 'pathReveal']);
    for (const provider of Object.values(capabilities)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('opens URLs and paths and reveals through the opener plugin', async () => {
    const { tauri, calls } = fakeTauri();
    const capabilities = makeTauriShellCapabilities(tauri);
    await expect(capabilities.external?.open('https://x.test')).resolves.toEqual({ reason: 'ok' });
    await expect(capabilities.pathOpen?.open('/tmp/a')).resolves.toEqual({ reason: 'ok' });
    await expect(capabilities.pathReveal?.reveal('/tmp/a')).resolves.toEqual({ reason: 'ok' });
    expect(calls.openUrl).toEqual(['https://x.test']);
    expect(calls.openPath).toEqual(['/tmp/a']);
    expect(calls.reveal).toEqual(['/tmp/a']);
  });

  it('preserves the path rejection message', async () => {
    const capabilities = makeTauriShellCapabilities(fakeTauri(new Error('boom')).tauri);
    await expect(capabilities.pathOpen?.open('/tmp/a')).resolves.toEqual({
      message: 'boom',
      reason: 'operation-failed',
    });
  });

  it('does not turn an empty rejected path open into success', async () => {
    const capabilities = makeTauriShellCapabilities(fakeTauri('').tauri);
    await expect(capabilities.pathOpen?.open('/tmp/a')).resolves.toEqual({ message: '', reason: 'operation-failed' });
  });

  it('maps external and reveal rejection without inventing unsupported slots', async () => {
    const capabilities = makeTauriShellCapabilities(fakeTauri(new Error('boom')).tauri);
    await expect(capabilities.external?.open('https://x.test')).resolves.toEqual({ reason: 'operation-failed' });
    await expect(capabilities.pathReveal?.reveal('/tmp/a')).resolves.toEqual({ reason: 'operation-failed' });
    expect(capabilities.beep).toBeUndefined();
    expect(capabilities.shortcutLink).toBeUndefined();
    expect(capabilities.trash).toBeUndefined();
  });
});

const NO_REJECTION = Symbol('no rejection');
