import type { TauriApi, TauriDialogOpenOptions, TauriDialogSaveOptions } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createTauriDirectoryOpenDialogBackend,
  createTauriFileOpenDialogBackend,
  createTauriFileSaveDialogBackend,
  createTauriMessageDialogBackend,
} from './tauriDialog';

interface DialogCalls {
  open: TauriDialogOpenOptions[];
  save: TauriDialogSaveOptions[];
  confirm: { message: string; kind?: string }[];
  message: { message: string; kind?: string }[];
}

function fakeTauri(openResult: string | string[] | null | Error, saveResult: string | null | Error) {
  const calls: DialogCalls = { open: [], save: [], confirm: [], message: [] };
  const tauri = {
    dialog: {
      async open(options: TauriDialogOpenOptions) {
        calls.open.push(options);
        if (openResult instanceof Error) throw openResult;
        return openResult;
      },
      async save(options: TauriDialogSaveOptions) {
        calls.save.push(options);
        if (saveResult instanceof Error) throw saveResult;
        return saveResult;
      },
      async message(message: string, options?: { kind?: string }) {
        calls.message.push({ message, kind: options?.kind });
      },
      async confirm(message: string, options?: { kind?: string }) {
        calls.confirm.push({ message, kind: options?.kind });
        return true;
      },
      async ask() {
        return true;
      },
    },
  } as unknown as TauriApi;
  return { tauri, calls };
}

describe('createTauriMessageDialogBackend', () => {
  it('maps message to an acknowledgement result and confirm to a boolean', async () => {
    const { tauri, calls } = fakeTauri(null, null);
    const backend = createTauriMessageDialogBackend(tauri);
    const result = await backend.message({ message: 'Hi', kind: 'question' });
    expect(result).toEqual({ buttonIndex: 0, cancelled: false, checkboxChecked: false });
    expect(calls.message[0].kind).toBe('info');
    expect(await backend.confirm({ message: 'Sure?', kind: 'warning' })).toBe(true);
    expect(calls.confirm[0].kind).toBe('warning');
  });
});

describe('Tauri file dialog providers', () => {
  it('exposes independent Entity providers', () => {
    const tauri = fakeTauri(null, null).tauri;
    const providers = [
      createTauriDirectoryOpenDialogBackend(tauri),
      createTauriFileOpenDialogBackend(tauri),
      createTauriFileSaveDialogBackend(tauri),
    ];
    expect(providers.every((provider) => EntityRuntimeKey in provider)).toBe(true);
    expect(new Set(providers).size).toBe(3);
  });

  it('returns selected nonempty file handles and maps common filters/multiple', async () => {
    const { tauri, calls } = fakeTauri(['/home/u/a.txt', '/home/u/b.md'], null);
    const result = await createTauriFileOpenDialogBackend(tauri).open({
      filters: [{ accept: { 'text/plain': ['txt'], 'text/markdown': ['.md'] }, name: 'Text' }],
      multiple: true,
    });
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.handles.map((handle) => handle.path)).toEqual(['/home/u/a.txt', '/home/u/b.md']);
      expect(result.handles.every((handle) => EntityRuntimeKey in handle)).toBe(true);
    }
    expect(calls.open[0]).toEqual({
      directory: false,
      filters: [{ extensions: ['txt', 'md'], name: 'Text' }],
      multiple: true,
    });
  });

  it('uses the independent single-directory operation and preserves a root basename', async () => {
    const { tauri, calls } = fakeTauri('/', null);
    const result = await createTauriDirectoryOpenDialogBackend(tauri).open();
    expect(calls.open[0]).toEqual({ directory: true, multiple: false });
    expect(result.outcome === 'selected' ? result.handle.name : null).toBe('/');
  });

  it('distinguishes cancel, security denial, and operation failure', async () => {
    const cancelled = await createTauriFileOpenDialogBackend(fakeTauri(null, null).tauri).open({});
    const security = await createTauriFileOpenDialogBackend(
      fakeTauri(Object.assign(new Error('denied'), { code: 'EPERM' }), null).tauri,
    ).open({});
    const failed = await createTauriFileOpenDialogBackend(fakeTauri(new Error('broken'), null).tauri).open({});
    expect(cancelled.outcome).toBe('cancelled');
    expect(security.outcome).toBe('security-denied');
    expect(failed.outcome).toBe('file-open-failed');
  });

  it('maps the common defaultName invariant and returns a selected save handle', async () => {
    const { tauri, calls } = fakeTauri(null, '/out.png');
    const result = await createTauriFileSaveDialogBackend(tauri).save({ defaultName: 'suggested.png' });
    expect(calls.save[0].defaultPath).toBe('suggested.png');
    expect(result.outcome === 'selected' ? result.handle.path : null).toBe('/out.png');
  });

  it('reports runtime-unavailable when a Tauri dialog method is absent', async () => {
    const tauri = { dialog: {} } as TauriApi;
    expect((await createTauriDirectoryOpenDialogBackend(tauri).open()).outcome).toBe('runtime-unavailable');
    expect((await createTauriFileOpenDialogBackend(tauri).open({})).outcome).toBe('runtime-unavailable');
    expect((await createTauriFileSaveDialogBackend(tauri).save({})).outcome).toBe('runtime-unavailable');
  });
});
