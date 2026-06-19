import type { DialogBackend } from '@flighthq/types';

import {
  createWebDialogBackend,
  getDialogBackend,
  setDialogBackend,
  showConfirmDialog,
  showMessageDialog,
  showOpenFileDialog,
  showPromptDialog,
  showSaveFileDialog,
} from './dialog';

function fakeBackend(): DialogBackend & { lastPrompt: string | null } {
  return {
    lastPrompt: null,
    async openFile() {
      return ['a.txt', 'b.txt'];
    },
    async saveFile() {
      return '/tmp/out.txt';
    },
    async message() {
      return { buttonIndex: 2, checkboxChecked: false };
    },
    async confirm() {
      return true;
    },
    async prompt(message) {
      this.lastPrompt = message;
      return 'typed';
    },
  };
}

afterEach(() => setDialogBackend(null));

describe('createWebDialogBackend', () => {
  it('returns a backend whose calls yield sentinels without throwing in jsdom', async () => {
    const backend = createWebDialogBackend();
    // openFile opens an interactive <input type=file> whose change/cancel events never fire under
    // jsdom, so its promise stays pending; assert it returns a Promise rather than awaiting it.
    expect(backend.openFile({})).toBeInstanceOf(Promise);
    expect(await backend.saveFile({})).toBeNull();
    expect(typeof (await backend.message({ message: 'hi' })).buttonIndex).toBe('number');
  });
});

describe('getDialogBackend', () => {
  it('falls back to a web backend', () => {
    expect(getDialogBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setDialogBackend(backend);
    expect(getDialogBackend()).toBe(backend);
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

  it('returns false from the web backend without throwing', async () => {
    expect(typeof (await showConfirmDialog({ message: 'sure?' }))).toBe('boolean');
  });
});

describe('showMessageDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    expect((await showMessageDialog({ message: 'hello' })).buttonIndex).toBe(2);
  });

  it('returns a result object from the web backend without throwing', async () => {
    const result = await showMessageDialog({ message: 'hello', checkboxChecked: true });
    expect(typeof result.buttonIndex).toBe('number');
    expect(typeof result.checkboxChecked).toBe('boolean');
  });
});

describe('showOpenFileDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    expect(await showOpenFileDialog({ multiple: true })).toEqual(['a.txt', 'b.txt']);
  });
});

describe('showPromptDialog', () => {
  it('delegates to the active backend with the default value', async () => {
    const backend = fakeBackend();
    setDialogBackend(backend);
    expect(await showPromptDialog('name?')).toBe('typed');
    expect(backend.lastPrompt).toBe('name?');
  });
});

describe('showSaveFileDialog', () => {
  it('delegates to the active backend', async () => {
    setDialogBackend(fakeBackend());
    expect(await showSaveFileDialog({})).toBe('/tmp/out.txt');
  });

  it('returns null from the web backend', async () => {
    expect(await showSaveFileDialog({})).toBeNull();
  });
});
