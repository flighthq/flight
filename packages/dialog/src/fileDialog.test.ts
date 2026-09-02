import { createEntity } from '@flighthq/entity/contract';
import type { FileDialogHandle } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

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
    },
  };
}

describe('createFileDialogHandle', () => {
  it('creates an Entity whose provider-neutral runtime operations cross package boundaries', async () => {
    const handle = createFileDialogHandle('File', 'picked.txt', null, {
      async readText() {
        return 'retained';
      },
    });
    expect(EntityRuntimeKey in handle).toBe(true);
    expect(await getFileDialogHandleOperations(handle)?.readText?.()).toBe('retained');
  });
});

describe('getFileDialogHandleOperations', () => {
  it('does not turn a serialized IPC DTO back into a handle with runtime authority', () => {
    const handle = createFileDialogHandle('File', 'picked.txt', '/tmp/picked.txt');
    const dto = JSON.parse(JSON.stringify(handle)) as FileDialogHandle;
    expect(EntityRuntimeKey in dto).toBe(false);
    expect(getFileDialogHandleOperations(dto)).toBeNull();
  });
});

describe('showOpenDirectoryDialog', () => {
  it('routes the single-directory operation through its independent capability slot', async () => {
    const result = await showOpenDirectoryDialog(fakeHost());
    expect(result.outcome === 'selected' ? result.handle.kind : null).toBe('Directory');
  });

  it('preserves the directory-specific runtime-unavailable outcome', async () => {
    const host = {
      dialog: {
        directoryOpen: createEntity({
          async open() {
            return { outcome: 'runtime-unavailable' as const };
          },
        }),
      },
    };
    expect((await showOpenDirectoryDialog(host)).outcome).toBe('runtime-unavailable');
  });

  it('forwards cancellation options through the independent capability slot', async () => {
    const open = vi.fn(async () => ({ outcome: 'cancelled' as const }));
    const host = { dialog: { directoryOpen: createEntity({ open }) } };
    const signal = new AbortController().signal;
    await showOpenDirectoryDialog(host, { signal });
    expect(open).toHaveBeenCalledWith({ signal });
  });
});

describe('showOpenFileDialog', () => {
  it('routes file selection through its independent capability slot', async () => {
    const signal = new AbortController().signal;
    const host = fakeHost();
    const open = vi.spyOn(host.dialog.fileOpen, 'open');
    const result = await showOpenFileDialog(host, { multiple: true, signal });
    expect(result.outcome === 'selected' ? result.handles.length : 0).toBe(2);
    expect(open).toHaveBeenCalledWith({ multiple: true, signal });
  });

  it('preserves the file-open-specific security outcome', async () => {
    const host = {
      dialog: {
        fileOpen: createEntity({
          async open() {
            return { outcome: 'security-denied' as const };
          },
        }),
      },
    };
    expect((await showOpenFileDialog(host, {})).outcome).toBe('security-denied');
  });
});

describe('showSaveFileDialog', () => {
  it('routes file save through its independent capability slot', async () => {
    const result = await showSaveFileDialog(fakeHost(), { defaultName: 'out.txt' });
    expect(result.outcome === 'selected' ? result.handle.name : null).toBe('out.txt');
  });

  it('preserves the file-save-specific failure outcome', async () => {
    const host = {
      dialog: {
        fileSave: createEntity({
          async save() {
            return { outcome: 'file-save-failed' as const };
          },
        }),
      },
    };
    expect((await showSaveFileDialog(host, {})).outcome).toBe('file-save-failed');
  });
});
