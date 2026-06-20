import { createElectronDialogBackend } from './dialog';
import type {
  ElectronApi,
  ElectronMessageBoxOptions,
  ElectronOpenDialogOptions,
  ElectronSaveDialogOptions,
} from './electronModule';

function fakeElectron(overrides: {
  open?: { canceled: boolean; filePaths: string[] };
  save?: { canceled: boolean; filePath?: string };
  message?: { response: number; checkboxChecked: boolean };
}): {
  electron: ElectronApi;
  calls: {
    openOptions?: ElectronOpenDialogOptions;
    saveOptions?: ElectronSaveDialogOptions;
    messageOptions?: ElectronMessageBoxOptions;
  };
} {
  const calls: {
    openOptions?: ElectronOpenDialogOptions;
    saveOptions?: ElectronSaveDialogOptions;
    messageOptions?: ElectronMessageBoxOptions;
  } = {};
  const electron = {
    dialog: {
      showOpenDialog: async (_window: unknown, options: ElectronOpenDialogOptions) => {
        calls.openOptions = options;
        return overrides.open ?? { canceled: false, filePaths: [] };
      },
      showSaveDialog: async (_window: unknown, options: ElectronSaveDialogOptions) => {
        calls.saveOptions = options;
        return overrides.save ?? { canceled: false, filePath: undefined };
      },
      showMessageBox: async (_window: unknown, options: ElectronMessageBoxOptions) => {
        calls.messageOptions = options;
        return overrides.message ?? { response: 0, checkboxChecked: false };
      },
    },
  } as unknown as ElectronApi;
  return { electron, calls };
}

describe('createElectronDialogBackend', () => {
  it('builds open-dialog properties from options and returns file paths', async () => {
    const { electron, calls } = fakeElectron({ open: { canceled: false, filePaths: ['/a', '/b'] } });
    const backend = createElectronDialogBackend(electron);
    const paths = await backend.openFile({ multiple: true, directory: true });
    expect(paths).toEqual(['/a', '/b']);
    expect(calls.openOptions?.properties).toEqual(['openFile', 'multiSelections', 'openDirectory']);
  });

  it('returns an empty array when the open dialog is canceled', async () => {
    const { electron } = fakeElectron({ open: { canceled: true, filePaths: ['/a'] } });
    const backend = createElectronDialogBackend(electron);
    expect(await backend.openFile({})).toEqual([]);
  });

  it('returns the save path or null when canceled or empty', async () => {
    const ok = fakeElectron({ save: { canceled: false, filePath: '/out.txt' } });
    expect(await createElectronDialogBackend(ok.electron).saveFile({})).toBe('/out.txt');
    const canceled = fakeElectron({ save: { canceled: true } });
    expect(await createElectronDialogBackend(canceled.electron).saveFile({})).toBeNull();
  });

  it('maps message results to button index and checkbox state', async () => {
    const { electron, calls } = fakeElectron({ message: { response: 2, checkboxChecked: true } });
    const backend = createElectronDialogBackend(electron);
    const result = await backend.message({ message: 'hi', kind: 'warning' });
    expect(result).toEqual({ buttonIndex: 2, checkboxChecked: true });
    expect(calls.messageOptions?.type).toBe('warning');
  });

  it('confirm returns true only when the OK button is chosen', async () => {
    const yes = fakeElectron({ message: { response: 0, checkboxChecked: false } });
    expect(await createElectronDialogBackend(yes.electron).confirm({ message: 'ok?' })).toBe(true);
    const no = fakeElectron({ message: { response: 1, checkboxChecked: false } });
    expect(await createElectronDialogBackend(no.electron).confirm({ message: 'ok?' })).toBe(false);
    expect(no.calls.messageOptions?.buttons).toEqual(['OK', 'Cancel']);
  });

  it('prompt resolves to null since Electron has no native text dialog', async () => {
    const { electron } = fakeElectron({});
    const backend = createElectronDialogBackend(electron);
    expect(await backend.prompt('name?', 'default')).toBeNull();
  });
});
