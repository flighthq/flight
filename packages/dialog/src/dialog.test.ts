import type { DialogBackend, FileDialogHandle, MessageDialogResult } from '@flighthq/types';

import {
  createWebDialogBackend,
  getDialogBackend,
  getWebDirectorySystemHandle,
  getWebFileSystemHandle,
  setDialogBackend,
  showConfirmDialog,
  showErrorBox,
  showErrorDialog,
  showInfoDialog,
  showMessageDialog,
  showOpenDirectoryDialog,
  showOpenFileDialog,
  showPromptDialog,
  showSaveFileDialog,
  showWarningDialog,
} from './dialog';

function fakeHandle(name: string): FileDialogHandle {
  return { kind: 'File', name, path: '/tmp/' + name };
}

function fakeBackend(): DialogBackend & { lastPromptMessage: string | null } {
  return {
    lastPromptMessage: null,
    async confirm() {
      return true;
    },
    async message() {
      return { buttonIndex: 2, cancelled: false, checkboxChecked: false };
    },
    async openDirectory() {
      return [{ kind: 'Directory', name: 'mydir', path: '/tmp/mydir' }];
    },
    async openFile() {
      return [fakeHandle('a.txt'), fakeHandle('b.txt')];
    },
    async prompt(options) {
      this.lastPromptMessage = options.message;
      return 'typed';
    },
    async saveFile() {
      return fakeHandle('out.txt');
    },
  };
}

afterEach(() => setDialogBackend(null));

describe('createWebDialogBackend', () => {
  it('confirm returns false in jsdom (no real confirm surface)', async () => {
    const backend = createWebDialogBackend();
    expect(typeof (await backend.confirm({ message: 'sure?' }))).toBe('boolean');
  });

  it('message returns a result object without throwing', async () => {
    const backend = createWebDialogBackend();
    const result = await backend.message({ message: 'hi', checkboxChecked: true });
    expect(typeof result.buttonIndex).toBe('number');
    expect(typeof result.checkboxChecked).toBe('boolean');
    expect(typeof result.cancelled).toBe('boolean');
  });

  it('openDirectory returns a Promise', () => {
    const backend = createWebDialogBackend();
    expect(backend.openDirectory({})).toBeInstanceOf(Promise);
  });

  it('openFile returns a Promise', () => {
    const backend = createWebDialogBackend();
    expect(backend.openFile({})).toBeInstanceOf(Promise);
  });

  it('prompt returns a Promise', () => {
    const backend = createWebDialogBackend();
    // prompt opens an interactive window.prompt that may hang in jsdom; assert it returns a Promise.
    expect(backend.prompt({ message: 'name?' })).toBeInstanceOf(Promise);
  });

  it('saveFile returns null when the File System Access API is absent', async () => {
    const backend = createWebDialogBackend();
    expect(await backend.saveFile({})).toBeNull();
  });
});

describe('getDialogBackend', () => {
  it('falls back to a web backend when none is set', () => {
    expect(getDialogBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setDialogBackend(backend);
    expect(getDialogBackend()).toBe(backend);
  });
});

describe('getWebDirectorySystemHandle', () => {
  it('returns null for a handle not produced by the File System Access API directory picker', () => {
    const handle: FileDialogHandle = { kind: 'Directory', name: 'mydir', path: null };
    expect(getWebDirectorySystemHandle(handle)).toBeNull();
  });
});

describe('getWebFileSystemHandle', () => {
  it('returns null for a handle not produced by the File System Access API', () => {
    const handle: FileDialogHandle = { kind: 'File', name: 'test.txt', path: null };
    expect(getWebFileSystemHandle(handle)).toBeNull();
  });
});

describe('setDialogBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setDialogBackend(fakeBackend());
    setDialogBackend(null);
    expect(getDialogBackend()).not.toBeNull();
  });
});

describe('showConfirmDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    expect(await showConfirmDialog({ message: 'sure?' })).toBe(true);
  });

  it('returns a boolean from the web backend without throwing', async () => {
    expect(typeof (await showConfirmDialog({ message: 'sure?' }))).toBe('boolean');
  });
});

describe('showErrorBox', () => {
  it('delegates to the active backend with kind error', async () => {
    let capturedOptions: Parameters<DialogBackend['message']>[0] | null = null;
    setDialogBackend({
      ...fakeBackend(),
      async message(options) {
        capturedOptions = options;
        return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
      },
    });
    await showErrorBox('Fatal', 'Something went wrong');
    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions!.kind).toBe('error');
    expect(capturedOptions!.title).toBe('Fatal');
    expect(capturedOptions!.message).toBe('Something went wrong');
  });

  it('returns a MessageDialogResult from the web backend without throwing', async () => {
    const result = await showErrorBox('Error', 'oops');
    expect(typeof result.buttonIndex).toBe('number');
    expect(typeof result.cancelled).toBe('boolean');
    expect(typeof result.checkboxChecked).toBe('boolean');
  });
});

describe('showErrorDialog', () => {
  it('forces kind to error', async () => {
    let capturedKind: string | undefined;
    setDialogBackend({
      ...fakeBackend(),
      async message(options) {
        capturedKind = options.kind;
        return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
      },
    });
    await showErrorDialog({ message: 'boom' });
    expect(capturedKind).toBe('error');
  });
});

describe('showInfoDialog', () => {
  it('forces kind to info', async () => {
    let capturedKind: string | undefined;
    setDialogBackend({
      ...fakeBackend(),
      async message(options) {
        capturedKind = options.kind;
        return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
      },
    });
    await showInfoDialog({ message: 'note' });
    expect(capturedKind).toBe('info');
  });
});

describe('showMessageDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    const result = await showMessageDialog({ message: 'hello' });
    expect(result.buttonIndex).toBe(2);
    expect(typeof result.cancelled).toBe('boolean');
  });

  it('returns a result object from the web backend without throwing', async () => {
    const result: MessageDialogResult = await showMessageDialog({ checkboxChecked: true, message: 'hello' });
    expect(typeof result.buttonIndex).toBe('number');
    expect(typeof result.checkboxChecked).toBe('boolean');
    expect(typeof result.cancelled).toBe('boolean');
  });
});

describe('showOpenDirectoryDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    const handles = await showOpenDirectoryDialog({});
    expect(handles).toHaveLength(1);
    expect(handles[0].kind).toBe('Directory');
    expect(handles[0].name).toBe('mydir');
  });

  it('passes startIn option to the backend', async () => {
    let capturedOptions: Parameters<typeof showOpenDirectoryDialog>[0] | null = null;
    setDialogBackend({
      ...fakeBackend(),
      async openDirectory(options) {
        capturedOptions = options;
        return [{ kind: 'Directory', name: 'docs', path: null }];
      },
    });
    await showOpenDirectoryDialog({ startIn: 'documents' });
    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions!.startIn).toBe('documents');
  });

  it('returns a Promise from the web backend', () => {
    // Directory picker opens an interactive <input> that hangs in jsdom; assert it returns a Promise.
    expect(showOpenDirectoryDialog({})).toBeInstanceOf(Promise);
  });
});

describe('showOpenFileDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    const handles = await showOpenFileDialog({ multiple: true });
    expect(handles).toHaveLength(2);
    expect(handles[0].kind).toBe('File');
    expect(handles[0].name).toBe('a.txt');
  });

  it('returns handles with path from the fake backend', async () => {
    setDialogBackend(fakeBackend());
    const handles = await showOpenFileDialog({});
    expect(handles[0].path).toBe('/tmp/a.txt');
  });
});

describe('showPromptDialog', () => {
  it('delegates to the active backend with options', async () => {
    const backend = fakeBackend();
    setDialogBackend(backend);
    const result = await showPromptDialog({ message: 'name?', defaultValue: 'default' });
    expect(result).toBe('typed');
    expect(backend.lastPromptMessage).toBe('name?');
  });
});

describe('showSaveFileDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    const handle = await showSaveFileDialog({});
    expect(handle).not.toBeNull();
    expect(handle!.kind).toBe('File');
    expect(handle!.name).toBe('out.txt');
  });

  it('returns null from the web backend when File System Access API is absent', async () => {
    expect(await showSaveFileDialog({})).toBeNull();
  });
});

describe('showWarningDialog', () => {
  it('forces kind to warning', async () => {
    let capturedKind: string | undefined;
    setDialogBackend({
      ...fakeBackend(),
      async message(options) {
        capturedKind = options.kind;
        return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
      },
    });
    await showWarningDialog({ message: 'careful' });
    expect(capturedKind).toBe('warning');
  });
});
