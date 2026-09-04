import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, MessageDialogBackend, PromptDialogBackend } from '@flighthq/types/contract';

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

function fakeHost() {
  return {
    dialog: {
      message: (() => { const out = allocateEntity<unknown>(); out.confirm = async () => {
          return true;
        }; out.message = async () => {
          return { buttonIndex: 2, cancelled: false, checkboxChecked: false };
        }; return finishEntity(out); })(),
      prompt: (() => { const out = allocateEntity<unknown>(); out.prompt = async () => {
          return 'typed';
        }; return finishEntity(out); })(),
    },
  };
}

function severityHost(observed: string[]) {
  return {
    dialog: {
      message: (() => { const out = allocateEntity<unknown>(); out.confirm = async () => {
          return true;
        }; out.message = async (options: Parameters<MessageDialogBackend['message']>[0]) => {
          observed.push(options.kind ?? 'none');
          return { buttonIndex: 0, cancelled: false, checkboxChecked: false };
        }; return finishEntity(out); })(),
    },
  };
}

describe('showConfirmDialog', () => {
  it('delegates confirmation through the explicit message slot', async () => {
    expect(await showConfirmDialog(fakeHost(), { message: 'sure?' })).toBe(true);
  });

  it('forwards a live signal through the explicit message slot', async () => {
    const confirm = vi.fn(async () => true);
    const host = { dialog: { message: (() => { const out = allocateEntity<unknown>(); out.confirm = confirm; out.message = vi.fn(); return finishEntity(out); })() } };
    const signal = new AbortController().signal;
    await showConfirmDialog(host, { message: 'sure?', signal });
    expect(confirm).toHaveBeenCalledWith({ message: 'sure?', signal });
  });
});

describe('showErrorBox', () => {
  it('maps the error-box convenience call to error severity', async () => {
    const observed: string[] = [];
    await showErrorBox(severityHost(observed), 'Fatal', 'boom');
    expect(observed).toEqual(['error']);
  });
});

describe('showErrorDialog', () => {
  it('maps the error convenience call to error severity', async () => {
    const observed: string[] = [];
    await showErrorDialog(severityHost(observed), { message: 'boom' });
    expect(observed).toEqual(['error']);
  });
});

describe('showInfoDialog', () => {
  it('maps the info convenience call to info severity', async () => {
    const observed: string[] = [];
    await showInfoDialog(severityHost(observed), { message: 'note' });
    expect(observed).toEqual(['info']);
  });
});

describe('showMessageDialog', () => {
  it('delegates messages through the explicit message slot', async () => {
    expect((await showMessageDialog(fakeHost(), { message: 'hello' })).buttonIndex).toBe(2);
  });
});

describe('showPromptDialog', () => {
  it('delegates prompts through the explicit prompt slot', async () => {
    expect(await showPromptDialog(fakeHost(), { message: 'name?' })).toBe('typed');
  });

  it('keeps the existing browser message and prompt providers callable', async () => {
    expect(typeof (await webMessageDialogBackend.confirm({ message: 'sure?' }))).toBe('boolean');
    expect(webPromptDialogBackend.prompt({ message: 'name?' })).toBeInstanceOf(Promise);
  });

  it('does not open the synchronous browser prompt when already aborted', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const controller = new AbortController();
    controller.abort();
    await expect(webPromptDialogBackend.prompt({ message: 'name?', signal: controller.signal })).resolves.toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('showWarningDialog', () => {
  it('maps the warning convenience call to warning severity', async () => {
    const observed: string[] = [];
    await showWarningDialog(severityHost(observed), { message: 'careful' });
    expect(observed).toEqual(['warning']);
  });
});
