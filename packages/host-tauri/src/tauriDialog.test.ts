import type { TauriApi, TauriDialogOpenOptions, TauriDialogSaveOptions } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  tauriHostDialog,
  tauriHostDirectoryOpenDialog,
  tauriHostFileOpenDialog,
  tauriHostFileSaveDialog,
  tauriHostMessageDialog,
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

describe('tauriHostDialog', () => {
  it('constructs exactly the four supported dialog leaves', () => {
    const group = tauriHostDialog(fakeTauri(null, null).tauri);
    expect(Object.keys(group).sort()).toEqual(['directoryOpen', 'fileOpen', 'fileSave', 'message']);
    expect(Object.values(group).every((provider) => EntityRuntimeKey in provider)).toBe(true);
  });
});

describe('tauriHostDirectoryOpenDialog', () => {
  it('uses a method-tight single-directory operation', async () => {
    const { tauri, calls } = fakeTauri('/docs', null);
    const result = await tauriHostDirectoryOpenDialog(tauri).open();
    expect(calls.open[0]).toEqual({ directory: true, multiple: false });
    expect(result.outcome === 'selected' ? result.handle.path : null).toBe('/docs');
  });
});

describe('tauriHostFileOpenDialog', () => {
  it('exposes independent Entity providers', () => {
    const tauri = fakeTauri(null, null).tauri;
    const providers = [
      tauriHostDirectoryOpenDialog(tauri),
      tauriHostFileOpenDialog(tauri),
      tauriHostFileSaveDialog(tauri),
    ];
    expect(providers.every((provider) => EntityRuntimeKey in provider)).toBe(true);
    expect(new Set(providers).size).toBe(3);
  });

  it('returns selected nonempty file handles and maps common filters/multiple', async () => {
    const { tauri, calls } = fakeTauri(['/home/u/a.txt', '/home/u/b.md'], null);
    const result = await tauriHostFileOpenDialog(tauri).open({
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
    const result = await tauriHostDirectoryOpenDialog(tauri).open();
    expect(calls.open[0]).toEqual({ directory: true, multiple: false });
    expect(result.outcome === 'selected' ? result.handle.name : null).toBe('/');
  });

  it('distinguishes cancel, security denial, and operation failure', async () => {
    const cancelled = await tauriHostFileOpenDialog(fakeTauri(null, null).tauri).open({});
    const security = await tauriHostFileOpenDialog(
      fakeTauri(Object.assign(new Error('denied'), { code: 'EPERM' }), null).tauri,
    ).open({});
    const failed = await tauriHostFileOpenDialog(fakeTauri(new Error('broken'), null).tauri).open({});
    expect(cancelled.outcome).toBe('cancelled');
    expect(security.outcome).toBe('security-denied');
    expect(failed.outcome).toBe('file-open-failed');
  });

  it('maps the common defaultName invariant and returns a selected save handle', async () => {
    const { tauri, calls } = fakeTauri(null, '/out.png');
    const result = await tauriHostFileSaveDialog(tauri).save({ defaultName: 'suggested.png' });
    expect(calls.save[0].defaultPath).toBe('suggested.png');
    expect(result.outcome === 'selected' ? result.handle.path : null).toBe('/out.png');
  });

  it('reports runtime-unavailable when a Tauri dialog method is absent', async () => {
    const tauri = { dialog: {} } as TauriApi;
    expect((await tauriHostDirectoryOpenDialog(tauri).open()).outcome).toBe('runtime-unavailable');
    expect((await tauriHostFileOpenDialog(tauri).open({})).outcome).toBe('runtime-unavailable');
    expect((await tauriHostFileSaveDialog(tauri).save({})).outcome).toBe('runtime-unavailable');
  });

  it('does not open a native picker when already aborted', async () => {
    const { tauri, calls } = fakeTauri('/ignored', null);
    const controller = new AbortController();
    controller.abort();
    await expect(tauriHostFileOpenDialog(tauri).open({ signal: controller.signal })).resolves.toEqual({
      outcome: 'cancelled',
    });
    expect(calls.open).toEqual([]);
  });

  it('preserves a native selection completed after an in-flight abort', async () => {
    const controller = new AbortController();
    const { tauri } = fakeTauri('/selected', null);
    const open = tauri.dialog.open;
    tauri.dialog.open = async (options) => {
      const result = await open(options);
      controller.abort(new Error('native picker already completed'));
      return result;
    };
    const result = await tauriHostFileOpenDialog(tauri).open({ signal: controller.signal });
    expect(result.outcome).toBe('selected');
  });
});

describe('tauriHostFileSaveDialog', () => {
  it('maps the common default name and returns one selected handle', async () => {
    const { tauri, calls } = fakeTauri(null, '/saved.txt');
    const result = await tauriHostFileSaveDialog(tauri).save({ defaultName: 'suggested.txt' });
    expect(calls.save[0].defaultPath).toBe('suggested.txt');
    expect(result.outcome === 'selected' ? result.handle.path : null).toBe('/saved.txt');
  });
});

describe('tauriHostMessageDialog', () => {
  it('maps message to an acknowledgement result and confirm to a boolean', async () => {
    const { tauri, calls } = fakeTauri(null, null);
    const backend = tauriHostMessageDialog(tauri);
    const result = await backend.message({ message: 'Hi', kind: 'question' });
    expect(result).toEqual({ buttonIndex: 0, cancelled: false, checkboxChecked: false });
    expect(calls.message[0].kind).toBe('info');
    expect(await backend.confirm({ message: 'Sure?', kind: 'warning' })).toBe(true);
    expect(calls.confirm[0].kind).toBe('warning');
  });
});
