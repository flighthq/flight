import { createEntity } from '@flighthq/entity/contract';
import type { FileDialogHandle, MessageDialogBackend, PromptDialogBackend } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  showConfirmDialog,
  showErrorBox,
  showErrorDialog,
  showInfoDialog,
  showMessageDialog,
  showPromptDialog,
  showWarningDialog,
  webMessageDialogBackend,
  webPromptDialogBackend,
} from './dialog';
import {
  createFileDialogHandle,
  getFileDialogHandleOperations,
  showOpenDirectoryDialog,
  showOpenFileDialog,
  showSaveFileDialog,
} from './fileDialog';

function fakeHost() {
  const directory = createFileDialogHandle('Directory', 'mydir', '/tmp/mydir');
  const first = createFileDialogHandle('File', 'a.txt', '/tmp/a.txt');
  const second = createFileDialogHandle('File', 'b.txt', '/tmp/b.txt');
  const saved = createFileDialogHandle('File', 'out.txt', '/tmp/out.txt');
  return {
    dialog: {
      directoryOpen: createEntity({
        async open() {
          return { handle: directory, outcome: 'selected' as const };
        },
      }),
      fileOpen: createEntity({
        async open() {
          return { handles: [first, second] as const, outcome: 'selected' as const };
        },
      }),
      fileSave: createEntity({
        async save() {
          return { handle: saved, outcome: 'selected' as const };
        },
      }),
      message: {
        async confirm() {
          return true;
        },
        async message() {
          return { buttonIndex: 2, cancelled: false, checkboxChecked: false };
        },
      } satisfies MessageDialogBackend,
      prompt: {
        async prompt() {
          return 'typed';
        },
      } satisfies PromptDialogBackend,
    },
  };
}

describe('file dialog dispatch', () => {
  it('routes each operation through its independent capability slot', async () => {
    const host = fakeHost();
    const directory = await showOpenDirectoryDialog(host);
    const open = await showOpenFileDialog(host, { multiple: true });
    const save = await showSaveFileDialog(host, { defaultName: 'out.txt' });
    expect(directory.outcome === 'selected' ? directory.handle.kind : null).toBe('Directory');
    expect(open.outcome === 'selected' ? open.handles.length : 0).toBe(2);
    expect(save.outcome === 'selected' ? save.handle.name : null).toBe('out.txt');
  });

  it('preserves method-tight terminal outcomes', async () => {
    const host = {
      dialog: {
        directoryOpen: createEntity({
          async open() {
            return { outcome: 'runtime-unavailable' as const };
          },
        }),
        fileOpen: createEntity({
          async open() {
            return { outcome: 'security-denied' as const };
          },
        }),
        fileSave: createEntity({
          async save() {
            return { outcome: 'file-save-failed' as const };
          },
        }),
      },
    };
    expect((await showOpenDirectoryDialog(host)).outcome).toBe('runtime-unavailable');
    expect((await showOpenFileDialog(host, {})).outcome).toBe('security-denied');
    expect((await showSaveFileDialog(host, {})).outcome).toBe('file-save-failed');
  });
});

describe('FileDialogHandle', () => {
  it('is an Entity whose provider-neutral runtime operations cross package boundaries', async () => {
    const handle = createFileDialogHandle('File', 'picked.txt', null, {
      async readText() {
        return 'retained';
      },
    });
    expect(EntityRuntimeKey in handle).toBe(true);
    expect(await getFileDialogHandleOperations(handle)?.readText?.()).toBe('retained');
  });

  it('does not turn a serialized IPC DTO back into a handle with runtime authority', () => {
    const handle = createFileDialogHandle('File', 'picked.txt', '/tmp/picked.txt');
    const dto = JSON.parse(JSON.stringify(handle)) as FileDialogHandle;
    expect(EntityRuntimeKey in dto).toBe(false);
    expect(getFileDialogHandleOperations(dto)).toBeNull();
  });
});

describe('message and prompt dialogs', () => {
  it('delegates confirmation, message, and prompt through their existing explicit slots', async () => {
    const host = fakeHost();
    expect(await showConfirmDialog(host, { message: 'sure?' })).toBe(true);
    expect((await showMessageDialog(host, { message: 'hello' })).buttonIndex).toBe(2);
    expect(await showPromptDialog(host, { message: 'name?' })).toBe('typed');
  });

  it('applies severity convenience methods', async () => {
    const observed: string[] = [];
    const host = {
      dialog: {
        message: {
          async confirm() {
            return true;
          },
          async message(options: Parameters<MessageDialogBackend['message']>[0]) {
            observed.push(options.kind ?? 'none');
            return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
          },
        },
      },
    };
    await showErrorBox(host, 'Fatal', 'boom');
    await showErrorDialog(host, { message: 'boom' });
    await showInfoDialog(host, { message: 'note' });
    await showWarningDialog(host, { message: 'careful' });
    expect(observed).toEqual(['error', 'error', 'info', 'warning']);
  });

  it('keeps the existing browser message and prompt providers callable', async () => {
    expect(typeof (await webMessageDialogBackend.confirm({ message: 'sure?' }))).toBe('boolean');
    expect(webPromptDialogBackend.prompt({ message: 'name?' })).toBeInstanceOf(Promise);
  });
});

describe('showConfirmDialog', () => {
  it('returns the selected provider confirmation', async () => {
    await expect(showConfirmDialog(fakeHost(), { message: 'sure?' })).resolves.toBe(true);
  });
});

describe('showErrorBox', () => {
  it('dispatches an error acknowledgement', async () => {
    await expect(showErrorBox(fakeHost(), 'Error', 'failed')).resolves.toBeUndefined();
  });
});

describe('showErrorDialog', () => {
  it('returns the message result', async () => {
    await expect(showErrorDialog(fakeHost(), { message: 'failed' })).resolves.toMatchObject({ buttonIndex: 2 });
  });
});

describe('showInfoDialog', () => {
  it('returns the message result', async () => {
    await expect(showInfoDialog(fakeHost(), { message: 'info' })).resolves.toMatchObject({ buttonIndex: 2 });
  });
});

describe('showMessageDialog', () => {
  it('returns the message result', async () => {
    await expect(showMessageDialog(fakeHost(), { message: 'message' })).resolves.toMatchObject({ buttonIndex: 2 });
  });
});

describe('showPromptDialog', () => {
  it('returns the provider text', async () => {
    await expect(showPromptDialog(fakeHost(), { message: 'name?' })).resolves.toBe('typed');
  });
});

describe('showWarningDialog', () => {
  it('returns the message result', async () => {
    await expect(showWarningDialog(fakeHost(), { message: 'warning' })).resolves.toMatchObject({ buttonIndex: 2 });
  });
});
