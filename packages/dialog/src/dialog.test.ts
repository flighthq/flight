import type { DialogBackend, FileDialogHandle, MessageDialogResult } from '@flighthq/types/contract';

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
  explainDialogBackend,
  installDialogHostBackend,
  observeDialogHostResult,
  resetDialogBackendForTest,
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

  it('does not send an empty accept map for an all-wildcard filter', async () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'showOpenFilePicker');
    let pickerOptions: unknown;
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async (options: unknown) => {
        pickerOptions = options;
        return [];
      },
    });
    try {
      const backend = createWebDialogBackend();
      await backend.openFile({ filters: [{ extensions: ['*'], name: 'All files' }] });
      expect(pickerOptions).toEqual({ multiple: false });
    } finally {
      if (previous === undefined) delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
      else Object.defineProperty(window, 'showOpenFilePicker', previous);
    }
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

describe('explainDialogBackend', () => {
  afterEach(() => resetDialogBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetDialogBackendForTest();
    const explanation = explainDialogBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setDialogBackend(fakeBackend());
    expect(explainDialogBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installDialogHostBackend(fakeBackend());
    expect(explainDialogBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installDialogHostBackend(fakeBackend());
    installDialogHostBackend(fakeBackend());
    expect(explainDialogBackend().conflict).toBe(true);
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

describe('installDialogHostBackend', () => {
  afterEach(() => resetDialogBackendForTest());

  it('installs a host backend that getDialogBackend returns', () => {
    const backend = fakeBackend();
    installDialogHostBackend(backend);
    expect(getDialogBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installDialogHostBackend(first);
    installDialogHostBackend(second);
    expect(getDialogBackend()).toBe(first);
    expect(explainDialogBackend().conflict).toBe(true);
  });
});

describe('observeDialogHostResult', () => {
  afterEach(() => resetDialogBackendForTest());

  it('records a successful observation', () => {
    installDialogHostBackend(fakeBackend());
    observeDialogHostResult('confirm', true);
    const explanation = explainDialogBackend();
    expect(explanation.operation).toBe('confirm');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installDialogHostBackend(fakeBackend());
    observeDialogHostResult('confirm', false);
    expect(explainDialogBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('resetDialogBackendForTest', () => {
  it('clears all backend slots', () => {
    setDialogBackend(fakeBackend());
    installDialogHostBackend(fakeBackend());
    observeDialogHostResult('confirm', true);
    resetDialogBackendForTest();
    expect(explainDialogBackend().layer).toBe('host-not-enabled');
    expect(explainDialogBackend().conflict).toBe(false);
    expect(explainDialogBackend().viability).toBe('unobserved');
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

describe('showOpenFileDialog File System Access filters', () => {
  // buildFileSystemAccessTypes had no coverage at all. These pin what each filter shape becomes in
  // the picker's `types` option — including the all-wildcard case, whose guard was already in place
  // but unpinned, so nothing would have caught its removal.
  interface PickerOptions {
    multiple?: boolean;
    types?: { accept: Record<string, string[]>; description: string }[];
  }

  async function pickerTypes(filters?: unknown): Promise<PickerOptions['types']> {
    let seen: PickerOptions = {};
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async (options: PickerOptions) => {
      seen = options;
      return [];
    };
    try {
      await createWebDialogBackend().openFile({ filters } as never);
    } finally {
      delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
    }
    return seen.types;
  }

  it('omits an all-wildcard filter group rather than sending an empty accept map', async () => {
    // `{ accept: {} }` is what the File System Access API rejects, so the group is dropped entirely.
    expect(await pickerTypes([{ extensions: ['*'], name: 'All Files' }])).toBeUndefined();
  });

  it('omits a filter group with no extensions at all', async () => {
    expect(await pickerTypes([{ extensions: [], name: 'Empty' }])).toBeUndefined();
  });

  it('sends no types at all when there are no filters', async () => {
    expect(await pickerTypes(undefined)).toBeUndefined();
    expect(await pickerTypes([])).toBeUndefined();
  });

  it('keeps the real groups when an all-wildcard group sits alongside them', async () => {
    // The wildcard group is dropped, but it must not take its neighbours with it.
    const types = await pickerTypes([
      { extensions: ['*'], name: 'All Files' },
      { extensions: ['txt'], name: 'Text' },
    ]);
    expect(types).toEqual([{ accept: { 'application/octet-stream': ['.txt'] }, description: 'Text' }]);
  });

  it('normalizes extensions to a leading dot', async () => {
    const types = await pickerTypes([{ extensions: ['txt', '.md'], name: 'Docs' }]);
    expect(types?.[0].accept['application/octet-stream']).toEqual(['.txt', '.md']);
  });

  it('drops the wildcard from a group that also names real extensions', async () => {
    const types = await pickerTypes([{ extensions: ['*', 'txt'], name: 'Text' }]);
    expect(types?.[0].accept['application/octet-stream']).toEqual(['.txt']);
  });

  it('keys the accept map by the declared MIME type when one is given', async () => {
    const types = await pickerTypes([{ extensions: ['png'], mimeTypes: ['image/png'], name: 'PNG' }]);
    expect(types).toEqual([{ accept: { 'image/png': ['.png'] }, description: 'PNG' }]);
  });

  it('accepts a MIME type with no extension constraint when the group is all-wildcard', async () => {
    // Not the empty-accept case: an empty extension list under a real MIME key is valid and means
    // "this MIME, any extension", which is a faithful reading of extensions:['*'] plus a MIME.
    const types = await pickerTypes([{ extensions: ['*'], mimeTypes: ['image/png'], name: 'Images' }]);
    expect(types).toEqual([{ accept: { 'image/png': [] }, description: 'Images' }]);
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
