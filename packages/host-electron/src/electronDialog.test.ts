import type {
  ElectronApi,
  ElectronMessageBoxOptions,
  ElectronOpenDialogOptions,
  ElectronSaveDialogOptions,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  electronHostDialog,
  electronHostDirectoryOpenDialog,
  electronHostFileOpenDialog,
  electronHostFileSaveDialog,
  electronHostMessageDialog,
  populateElectronHostDirectoryOpenDialog,
  populateElectronHostFileOpenDialog,
  populateElectronHostFileSaveDialog,
  populateElectronHostMessageDialog,
} from './electronDialog';

function fakeElectron(overrides: {
  open?: { canceled: boolean; filePaths: string[] } | Error;
  save?: { canceled: boolean; filePath?: string } | Error;
  message?: { response: number; checkboxChecked: boolean };
}) {
  const calls: {
    openOptions?: ElectronOpenDialogOptions;
    saveOptions?: ElectronSaveDialogOptions;
    messageOptions?: ElectronMessageBoxOptions;
  } = {};
  const electron = {
    dialog: {
      async showOpenDialog(_window: unknown, options: ElectronOpenDialogOptions) {
        calls.openOptions = options;
        if (overrides.open instanceof Error) throw overrides.open;
        return overrides.open ?? { canceled: false, filePaths: [] };
      },
      async showSaveDialog(_window: unknown, options: ElectronSaveDialogOptions) {
        calls.saveOptions = options;
        if (overrides.save instanceof Error) throw overrides.save;
        return overrides.save ?? { canceled: false, filePath: undefined };
      },
      async showMessageBox(_window: unknown, options: ElectronMessageBoxOptions) {
        calls.messageOptions = options;
        return overrides.message ?? { response: 0, checkboxChecked: false };
      },
    },
  } as unknown as ElectronApi;
  return { electron, calls };
}

describe('electronHostDialog', () => {
  it('constructs the exact Entity-backed dialog group', () => {
    const dialog = electronHostDialog(fakeElectron({}).electron);
    expect(Object.keys(dialog).sort()).toEqual(['directoryOpen', 'fileOpen', 'fileSave', 'message']);
    for (const provider of Object.values(dialog)) expect(EntityRuntimeKey in provider).toBe(true);
  });
});

describe('electronHostDirectoryOpenDialog', () => {
  it('uses a method-tight single-directory operation', async () => {
    const { electron, calls } = fakeElectron({ open: { canceled: false, filePaths: ['/docs'] } });
    const result = await electronHostDirectoryOpenDialog(electron).open();
    expect(calls.openOptions).toEqual({ properties: ['openDirectory'] });
    expect(result.outcome === 'selected' ? result.handle.path : null).toBe('/docs');
  });
});

describe('electronHostFileOpenDialog', () => {
  it('exposes independent Entity providers', () => {
    const electron = fakeElectron({}).electron;
    const providers = [
      electronHostDirectoryOpenDialog(electron),
      electronHostFileOpenDialog(electron),
      electronHostFileSaveDialog(electron),
    ];
    expect(providers.every((provider) => EntityRuntimeKey in provider)).toBe(true);
    expect(new Set(providers).size).toBe(3);
  });

  it('returns selected nonempty file handles and maps common filters/multiple', async () => {
    const { electron, calls } = fakeElectron({ open: { canceled: false, filePaths: ['/a', '/b'] } });
    const result = await electronHostFileOpenDialog(electron).open({
      filters: [{ accept: { 'text/plain': ['.txt'], 'text/markdown': ['md'] }, name: 'Text' }],
      multiple: true,
    });
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.handles.map((handle) => handle.name)).toEqual(['a', 'b']);
      expect(result.handles.every((handle) => EntityRuntimeKey in handle)).toBe(true);
    }
    expect(calls.openOptions).toEqual({
      filters: [{ extensions: ['txt', 'md'], name: 'Text' }],
      properties: ['openFile', 'multiSelections'],
    });
  });

  it('uses the independent single-directory operation and preserves a root basename', async () => {
    const { electron, calls } = fakeElectron({ open: { canceled: false, filePaths: ['/'] } });
    const result = await electronHostDirectoryOpenDialog(electron).open();
    expect(calls.openOptions).toEqual({ properties: ['openDirectory'] });
    expect(result.outcome === 'selected' ? result.handle.name : null).toBe('/');
  });

  it('distinguishes cancel, security denial, and operation failure', async () => {
    const cancelled = await electronHostFileOpenDialog(
      fakeElectron({ open: { canceled: true, filePaths: ['/ignored'] } }).electron,
    ).open({});
    const security = await electronHostFileOpenDialog(
      fakeElectron({ open: Object.assign(new Error('denied'), { code: 'EACCES' }) }).electron,
    ).open({});
    const failed = await electronHostFileOpenDialog(fakeElectron({ open: new Error('broken') }).electron).open({});
    expect(cancelled.outcome).toBe('cancelled');
    expect(security.outcome).toBe('security-denied');
    expect(failed.outcome).toBe('file-open-failed');
  });

  it('maps the common defaultName invariant and returns a selected save handle', async () => {
    const { electron, calls } = fakeElectron({ save: { canceled: false, filePath: '/out.txt' } });
    const result = await electronHostFileSaveDialog(electron).save({ defaultName: 'suggested.txt' });
    expect(calls.saveOptions?.defaultPath).toBe('suggested.txt');
    expect(result.outcome === 'selected' ? result.handle.path : null).toBe('/out.txt');
  });

  it('reports runtime-unavailable when an Electron dialog method is absent', async () => {
    const electron = { dialog: {} } as ElectronApi;
    expect((await electronHostDirectoryOpenDialog(electron).open()).outcome).toBe('runtime-unavailable');
    expect((await electronHostFileOpenDialog(electron).open({})).outcome).toBe('runtime-unavailable');
    expect((await electronHostFileSaveDialog(electron).save({})).outcome).toBe('runtime-unavailable');
  });

  it('does not open a native picker when already aborted', async () => {
    const { electron, calls } = fakeElectron({ open: { canceled: false, filePaths: ['/ignored'] } });
    const controller = new AbortController();
    controller.abort();
    await expect(electronHostFileOpenDialog(electron).open({ signal: controller.signal })).resolves.toEqual({
      outcome: 'cancelled',
    });
    expect(calls.openOptions).toBeUndefined();
  });
});

describe('electronHostFileSaveDialog', () => {
  it('maps the common default name and returns one selected handle', async () => {
    const { electron, calls } = fakeElectron({ save: { canceled: false, filePath: '/saved.txt' } });
    const result = await electronHostFileSaveDialog(electron).save({ defaultName: 'suggested.txt' });
    expect(calls.saveOptions?.defaultPath).toBe('suggested.txt');
    expect(result.outcome === 'selected' ? result.handle.path : null).toBe('/saved.txt');
  });
});

describe('electronHostMessageDialog', () => {
  it('maps message results to button index, cancelled, and checkbox state', async () => {
    const { electron, calls } = fakeElectron({ message: { response: 2, checkboxChecked: true } });
    const result = await electronHostMessageDialog(electron).message({ message: 'hi', kind: 'warning' });
    expect(result).toEqual({ buttonIndex: 2, cancelled: false, checkboxChecked: true });
    expect(calls.messageOptions?.type).toBe('warning');
  });

  it('confirm returns true only when the OK button is chosen', async () => {
    const yes = fakeElectron({ message: { response: 0, checkboxChecked: false } });
    expect(await electronHostMessageDialog(yes.electron).confirm({ message: 'ok?' })).toBe(true);
    const no = fakeElectron({ message: { response: 1, checkboxChecked: false } });
    expect(await electronHostMessageDialog(no.electron).confirm({ message: 'ok?' })).toBe(false);
    expect(no.calls.messageOptions?.buttons).toEqual(['OK', 'Cancel']);
  });

  it('forwards the signal supported by Electron message boxes', async () => {
    const { electron, calls } = fakeElectron({});
    const signal = new AbortController().signal;
    await electronHostMessageDialog(electron).message({ message: 'wait', signal });
    expect(calls.messageOptions?.signal).toBe(signal);
  });
});
describe('populateElectronHostDirectoryOpenDialog', () => {
  it('is the construction initializer of electronHostDirectoryOpenDialog', () => {
    expect(typeof populateElectronHostDirectoryOpenDialog).toBe('function');
  });
});

describe('populateElectronHostFileOpenDialog', () => {
  it('is the construction initializer of electronHostFileOpenDialog', () => {
    expect(typeof populateElectronHostFileOpenDialog).toBe('function');
  });
});

describe('populateElectronHostFileSaveDialog', () => {
  it('is the construction initializer of electronHostFileSaveDialog', () => {
    expect(typeof populateElectronHostFileSaveDialog).toBe('function');
  });
});

describe('populateElectronHostMessageDialog', () => {
  it('is the construction initializer of electronHostMessageDialog', () => {
    expect(typeof populateElectronHostMessageDialog).toBe('function');
  });
});
