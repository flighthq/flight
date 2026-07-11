import { createTauriDialogBackend } from './tauriDialog';
import type { TauriApi, TauriDialogOpenOptions } from './tauriModule';

interface DialogCalls {
  open: TauriDialogOpenOptions[];
  confirm: { message: string; kind?: string }[];
  message: { message: string; kind?: string }[];
}

function fakeTauri(openResult: string | string[] | null, saveResult: string | null) {
  const calls: DialogCalls = { open: [], confirm: [], message: [] };
  const tauri = {
    dialog: {
      async open(options: TauriDialogOpenOptions) {
        calls.open.push(options);
        return openResult;
      },
      async save() {
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

describe('createTauriDialogBackend', () => {
  it('maps openFile results to populated file handles', async () => {
    const { tauri, calls } = fakeTauri('/home/u/a.txt', null);
    const backend = createTauriDialogBackend(tauri);
    const handles = await backend.openFile({ title: 'Open', filters: [{ name: 'Text', extensions: ['txt'] }] });
    expect(handles).toHaveLength(1);
    expect(handles[0]).toEqual({ kind: 'File', name: 'a.txt', path: '/home/u/a.txt' });
    expect(calls.open[0].directory).toBeUndefined();
    expect(calls.open[0].filters).toEqual([{ name: 'Text', extensions: ['txt'] }]);
  });

  it('normalizes a multi-select array and cancel (null) result', async () => {
    const multi = await createTauriDialogBackend(fakeTauri(['/a', '/b'], null).tauri).openFile({ multiple: true });
    expect(multi.map((h) => h.path)).toEqual(['/a', '/b']);
    const cancelled = await createTauriDialogBackend(fakeTauri(null, null).tauri).openFile({});
    expect(cancelled).toEqual([]);
  });

  it('opens directories with the directory flag and Directory kind', async () => {
    const { tauri, calls } = fakeTauri('/home/u/dir', null);
    const handles = await backend(tauri).openDirectory({});
    expect(calls.open[0].directory).toBe(true);
    expect(handles[0].kind).toBe('Directory');
  });

  it('maps saveFile to a single handle or null', async () => {
    expect((await backend(fakeTauri(null, '/out.png').tauri).saveFile({}))?.path).toBe('/out.png');
    expect(await backend(fakeTauri(null, null).tauri).saveFile({})).toBeNull();
  });

  it('maps message to an acknowledgement result and confirm to a boolean', async () => {
    const { tauri, calls } = fakeTauri(null, null);
    const result = await backend(tauri).message({ message: 'Hi', kind: 'question' });
    expect(result).toEqual({ buttonIndex: 0, cancelled: false, checkboxChecked: false });
    // 'question' has no Tauri glyph and falls back to 'info'.
    expect(calls.message[0].kind).toBe('info');
    expect(await backend(tauri).confirm({ message: 'Sure?', kind: 'warning' })).toBe(true);
    expect(calls.confirm[0].kind).toBe('warning');
  });

  it('reports the null sentinel for prompt (no Tauri text dialog)', async () => {
    expect(await backend(fakeTauri(null, null).tauri).prompt({ message: 'Name?' })).toBeNull();
  });
});

function backend(tauri: TauriApi) {
  return createTauriDialogBackend(tauri);
}
