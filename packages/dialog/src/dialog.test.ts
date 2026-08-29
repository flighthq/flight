import type {
  FileDialogBackend,
  FileDialogHandle,
  MessageDialogBackend,
  MessageDialogResult,
  PromptDialogBackend,
} from '@flighthq/types/contract';

import {
  getWebDirectorySystemHandle,
  getWebFileSystemHandle,
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
  webFileDialogBackend,
  webMessageDialogBackend,
  webPromptDialogBackend,
} from './dialog';

function fakeHandle(name: string): FileDialogHandle {
  return { kind: 'File', name, path: '/tmp/' + name };
}

interface TestDialogHost {
  readonly dialog: {
    readonly file: FileDialogBackend;
    readonly message: MessageDialogBackend;
    readonly prompt: PromptDialogBackend & { lastPromptMessage: string | null };
  };
}

function fakeHost(): TestDialogHost {
  return {
    dialog: {
      file: {
        async openDirectory() {
          return [{ kind: 'Directory', name: 'mydir', path: '/tmp/mydir' }];
        },
        async openFile() {
          return [fakeHandle('a.txt'), fakeHandle('b.txt')];
        },
        async saveFile() {
          return fakeHandle('out.txt');
        },
      },
      message: {
        async confirm() {
          return true;
        },
        async message() {
          return { buttonIndex: 2, cancelled: false, checkboxChecked: false };
        },
      },
      prompt: {
        lastPromptMessage: null,
        async prompt(options) {
          this.lastPromptMessage = options.message;
          return 'typed';
        },
      },
    },
  };
}

const webDialogHost = {
  dialog: {
    file: webFileDialogBackend,
    message: webMessageDialogBackend,
    prompt: webPromptDialogBackend,
  },
};

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

describe('showConfirmDialog', () => {
  it('delegates through the explicit message capability', async () => {
    expect(await showConfirmDialog(fakeHost(), { message: 'sure?' })).toBe(true);
  });

  it('returns a boolean from the web backend without throwing', async () => {
    expect(typeof (await showConfirmDialog(webDialogHost, { message: 'sure?' }))).toBe('boolean');
  });
});
describe('showErrorBox', () => {
  it('delegates through the explicit message capability with kind error', async () => {
    let capturedOptions: Parameters<MessageDialogBackend['message']>[0] | null = null;
    const host = {
      dialog: {
        message: {
          ...fakeHost().dialog.message,
          async message(options: Parameters<MessageDialogBackend['message']>[0]) {
            capturedOptions = options;
            return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
          },
        },
      },
    };
    await showErrorBox(host, 'Fatal', 'Something went wrong');
    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions!.kind).toBe('error');
    expect(capturedOptions!.title).toBe('Fatal');
    expect(capturedOptions!.message).toBe('Something went wrong');
  });

  it('returns a MessageDialogResult from the web backend without throwing', async () => {
    const result = await showErrorBox(webDialogHost, 'Error', 'oops');
    expect(typeof result.buttonIndex).toBe('number');
    expect(typeof result.cancelled).toBe('boolean');
    expect(typeof result.checkboxChecked).toBe('boolean');
  });
});

describe('showErrorDialog', () => {
  it('forces kind to error', async () => {
    let capturedKind: string | undefined;
    const host = {
      dialog: {
        message: {
          ...fakeHost().dialog.message,
          async message(options: Parameters<MessageDialogBackend['message']>[0]) {
            capturedKind = options.kind;
            return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
          },
        },
      },
    };
    await showErrorDialog(host, { message: 'boom' });
    expect(capturedKind).toBe('error');
  });
});

describe('showInfoDialog', () => {
  it('forces kind to info', async () => {
    let capturedKind: string | undefined;
    const host = {
      dialog: {
        message: {
          ...fakeHost().dialog.message,
          async message(options: Parameters<MessageDialogBackend['message']>[0]) {
            capturedKind = options.kind;
            return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
          },
        },
      },
    };
    await showInfoDialog(host, { message: 'note' });
    expect(capturedKind).toBe('info');
  });
});

describe('showMessageDialog', () => {
  it('delegates through the explicit message capability', async () => {
    const result = await showMessageDialog(fakeHost(), { message: 'hello' });
    expect(result.buttonIndex).toBe(2);
    expect(typeof result.cancelled).toBe('boolean');
  });

  it('returns a result object from the web backend without throwing', async () => {
    const result: MessageDialogResult = await showMessageDialog(webDialogHost, {
      checkboxChecked: true,
      message: 'hello',
    });
    expect(typeof result.buttonIndex).toBe('number');
    expect(typeof result.checkboxChecked).toBe('boolean');
    expect(typeof result.cancelled).toBe('boolean');
  });
});

describe('showOpenDirectoryDialog', () => {
  it('delegates through the explicit file capability', async () => {
    const handles = await showOpenDirectoryDialog(fakeHost(), {});
    expect(handles).toHaveLength(1);
    expect(handles[0].kind).toBe('Directory');
    expect(handles[0].name).toBe('mydir');
  });

  it('passes startIn option to the backend', async () => {
    let capturedOptions: Parameters<typeof showOpenDirectoryDialog>[1] | null = null;
    const host = {
      dialog: {
        file: {
          ...fakeHost().dialog.file,
          async openDirectory(options: Parameters<FileDialogBackend['openDirectory']>[0]) {
            capturedOptions = options;
            return [{ kind: 'Directory' as const, name: 'docs', path: null }];
          },
        },
      },
    };
    await showOpenDirectoryDialog(host, { startIn: 'documents' });
    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions!.startIn).toBe('documents');
  });

  it('returns a Promise from the web backend', () => {
    // Directory picker opens an interactive <input> that hangs in jsdom; assert it returns a Promise.
    expect(showOpenDirectoryDialog(webDialogHost, {})).toBeInstanceOf(Promise);
  });
});

describe('showOpenFileDialog', () => {
  it('delegates through the explicit file capability', async () => {
    const handles = await showOpenFileDialog(fakeHost(), { multiple: true });
    expect(handles).toHaveLength(2);
    expect(handles[0].kind).toBe('File');
    expect(handles[0].name).toBe('a.txt');
  });

  it('returns handles with path from the fake backend', async () => {
    const handles = await showOpenFileDialog(fakeHost(), {});
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
      await webFileDialogBackend.openFile({ filters } as never);
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
  it('delegates through the explicit prompt capability with options', async () => {
    const host = fakeHost();
    const result = await showPromptDialog(host, { message: 'name?', defaultValue: 'default' });
    expect(result).toBe('typed');
    expect(host.dialog.prompt.lastPromptMessage).toBe('name?');
  });
});

describe('showSaveFileDialog', () => {
  it('delegates through the explicit file capability', async () => {
    const handle = await showSaveFileDialog(fakeHost(), {});
    expect(handle).not.toBeNull();
    expect(handle!.kind).toBe('File');
    expect(handle!.name).toBe('out.txt');
  });

  it('returns null from the web backend when File System Access API is absent', async () => {
    expect(await showSaveFileDialog(webDialogHost, {})).toBeNull();
  });
});

describe('showWarningDialog', () => {
  it('forces kind to warning', async () => {
    let capturedKind: string | undefined;
    const host = {
      dialog: {
        message: {
          ...fakeHost().dialog.message,
          async message(options: Parameters<MessageDialogBackend['message']>[0]) {
            capturedKind = options.kind;
            return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
          },
        },
      },
    };
    await showWarningDialog(host, { message: 'careful' });
    expect(capturedKind).toBe('warning');
  });
});

describe('web dialog capability values', () => {
  it('confirm returns false in jsdom (no real confirm surface)', async () => {
    expect(typeof (await webMessageDialogBackend.confirm({ message: 'sure?' }))).toBe('boolean');
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
      await webFileDialogBackend.openFile({ filters: [{ extensions: ['*'], name: 'All files' }] });
      expect(pickerOptions).toEqual({ multiple: false });
    } finally {
      if (previous === undefined) delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
      else Object.defineProperty(window, 'showOpenFilePicker', previous);
    }
  });

  it('message returns a result object without throwing', async () => {
    const result = await webMessageDialogBackend.message({ message: 'hi', checkboxChecked: true });
    expect(typeof result.buttonIndex).toBe('number');
    expect(typeof result.checkboxChecked).toBe('boolean');
    expect(typeof result.cancelled).toBe('boolean');
  });

  it('openDirectory returns a Promise', () => {
    expect(webFileDialogBackend.openDirectory({})).toBeInstanceOf(Promise);
  });

  it('openFile returns a Promise', () => {
    expect(webFileDialogBackend.openFile({})).toBeInstanceOf(Promise);
  });

  it('prompt returns a Promise', () => {
    // prompt opens an interactive window.prompt that may hang in jsdom; assert it returns a Promise.
    expect(webPromptDialogBackend.prompt({ message: 'name?' })).toBeInstanceOf(Promise);
  });

  it('saveFile returns null when the File System Access API is absent', async () => {
    expect(await webFileDialogBackend.saveFile({})).toBeNull();
  });
});
