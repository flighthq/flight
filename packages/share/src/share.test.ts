import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostShareContentProvider,
  HostShareFilesProvider,
  ShareContent,
  ShareResult,
} from '@flighthq/types/contract';

import * as shareContract from './contract';
import {
  attachShareSignals,
  canShareContent,
  canShareFiles,
  detachShareSignals,
  disposeShareSignals,
  enableShareSignals,
  hasShareContentFields,
  initializeShareSignals,
  isShareFileValid,
  shareContent,
  shareContentWithResult,
  shareFiles,
  shareText,
  shareUrl,
} from './share';

function contentHost(overrides: Partial<HostShareContentProvider> = {}): {
  readonly share: { readonly content: HostShareContentProvider };
} {
  return {
    share: {
      content: (() => {
        const out = allocateEntity<HostShareContentProvider>();
        out.canShareContent = () => true;
        out.shareContent = async () => true;
        out.shareContentWithResult = async () => ({ activityType: null, completed: true, dismissed: false });
        Object.assign(out, overrides);
        return finishEntity(out);
      })(),
    },
  };
}

function filesHost(overrides: Partial<HostShareFilesProvider> = {}): {
  readonly share: { readonly files: HostShareFilesProvider };
} {
  return {
    share: {
      files: (() => {
        const out = allocateEntity<HostShareFilesProvider>();
        out.canShareContent = () => true;
        out.shareContent = async () => true;
        out.shareContentWithResult = async () => ({ activityType: null, completed: true, dismissed: false });
        Object.assign(out, overrides);
        return finishEntity(out);
      })(),
    },
  };
}

const file = { dataUrl: 'data:text/plain;base64,QQ==', mimeType: 'text/plain', name: 'a.txt' };

describe('attachShareSignals', () => {
  it('enables delivery from the detailed core command', async () => {
    const result: ShareResult = { activityType: 'mail', completed: true, dismissed: false };
    const host = contentHost({ shareContentWithResult: async () => result });
    const signals = enableShareSignals();
    const listener = vi.fn();
    connectSignal(signals.onShareResult, listener);
    attachShareSignals(signals);

    expect(await shareContentWithResult(host.share.content, { title: 'flight' })).toEqual(result);
    expect(listener).toHaveBeenCalledWith(result);
    detachShareSignals(signals);
  });
});

describe('canShareContent', () => {
  it('validates meaningful payloads through the selected content slot', () => {
    const can = vi.fn(() => true);
    const host = contentHost({ canShareContent: can });
    expect(canShareContent(host.share.content, { text: 'hello' })).toBe(true);
    expect(can).toHaveBeenCalledWith({ text: 'hello' });

    // @ts-expect-error an empty object is not a meaningful Share content payload
    expect(canShareContent(contentHost().share.content, {})).toBe(false);
  });
});

describe('canShareFiles', () => {
  it('validates through the files slot only for valid, non-empty lists', () => {
    const can = vi.fn(() => true);
    const host = filesHost({ canShareContent: can });
    expect(canShareFiles(host.share.files, [file])).toBe(true);
    expect(canShareFiles(host.share.files, [])).toBe(false);
    expect(canShareFiles(host.share.files, [{ ...file, dataUrl: 'data:text/plain;base64' }])).toBe(false);
    expect(can).toHaveBeenCalledTimes(1);
  });
});

describe('detachShareSignals', () => {
  it('stops delivery without clearing the signal Entity', async () => {
    const signals = enableShareSignals();
    const listener = vi.fn();
    connectSignal(signals.onShareResult, listener);
    attachShareSignals(signals);
    detachShareSignals(signals);
    await shareContentWithResult(contentHost().share.content, { title: 'quiet' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('disposeShareSignals', () => {
  it('dispose detaches and clears listeners', async () => {
    const signals = enableShareSignals();
    const listener = vi.fn();
    connectSignal(signals.onShareResult, listener);
    attachShareSignals(signals);
    disposeShareSignals(signals);
    await shareContentWithResult(contentHost().share.content, { text: 'quiet' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('enableShareSignals', () => {
  it('returns an Entity-composed signal group', () => {
    expect(EntityRuntimeKey in enableShareSignals()).toBe(true);
  });
});

describe('hasShareContentFields', () => {
  it.each<ShareContent>([{ title: 'T' }, { text: 'T' }, { url: 'https://flight.dev' }])(
    'accepts a meaningful content vector',
    (content) => expect(hasShareContentFields(content)).toBe(true),
  );
});

describe('initializeShareSignals', () => {
  it('is the construction initializer of createShareSignals', () => {
    expect(typeof initializeShareSignals).toBe('function');
  });
});

describe('isShareFileValid', () => {
  it.each([file, { ...file, dataUrl: 'data:,' }])('accepts a portable data URL descriptor', (candidate) => {
    expect(isShareFileValid(candidate)).toBe(true);
  });

  it.each([
    { ...file, dataUrl: 'text/plain;base64,QQ==' },
    { ...file, dataUrl: 'data:text/plain;base64' },
    { ...file, mimeType: '' },
    { ...file, name: '' },
  ])('rejects a malformed descriptor before provider dispatch', (candidate) => {
    expect(isShareFileValid(candidate)).toBe(false);
  });
});

describe('Share contract surface', () => {
  it('contains only explicit-host commands, payload validation, and core signal lifecycle', () => {
    expect(Object.keys(shareContract).sort()).toEqual([
      'attachShareSignals',
      'canShareContent',
      'canShareFiles',
      'detachShareSignals',
      'disposeShareSignals',
      'enableShareSignals',
      'hasShareContentFields',
      'initializeShareSignals',
      'isShareFileValid',
      'shareContent',
      'shareContentWithResult',
      'shareFiles',
      'shareText',
      'shareUrl',
    ]);
  });
});

describe('shareContent', () => {
  it('rejects declared-but-empty content before dispatch', async () => {
    const backend = vi.fn(async () => true);
    const host = contentHost({ shareContent: backend });
    const empty = { text: '' } as ShareContent;
    expect(canShareContent(host.share.content, empty)).toBe(false);
    expect(await shareContent(host.share.content, empty)).toBe(false);
    expect(backend).not.toHaveBeenCalled();
  });
});

describe('shareContentWithResult', () => {
  it('returns a detailed provider outcome', async () => {
    const result: ShareResult = { activityType: 'mail', completed: true, dismissed: false };
    const host = contentHost({ shareContentWithResult: async () => result });
    expect(await shareContentWithResult(host.share.content, { title: 'flight' })).toEqual(result);
  });
});

describe('shareFiles', () => {
  it('dispatches only a valid, non-empty portable file tuple', async () => {
    const invoke = vi.fn(async (_content: Parameters<HostShareFilesProvider['shareContent']>[0]) => true);
    const host = filesHost({ shareContent: invoke });
    expect(await shareFiles(host.share.files, [file])).toBe(true);
    expect(await shareFiles(host.share.files, [])).toBe(false);
    expect(await shareFiles(host.share.files, [{ ...file, dataUrl: 'not-a-data-url' }])).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0].files).toEqual([file]);
  });
});

describe('shareText', () => {
  it('delegates text through the content slot', async () => {
    const invoke = vi.fn(async (_content: Parameters<HostShareContentProvider['shareContent']>[0]) => true);
    expect(await shareText(contentHost({ shareContent: invoke }).share.content, 'hello')).toBe(true);
    expect(invoke).toHaveBeenCalledWith({ text: 'hello' });
  });
});
describe('shareUrl', () => {
  it('delegates a URL through the content slot', async () => {
    const invoke = vi.fn(async (_content: Parameters<HostShareContentProvider['shareContent']>[0]) => true);
    expect(await shareUrl(contentHost({ shareContent: invoke }).share.content, 'https://flight.dev')).toBe(true);
    expect(invoke).toHaveBeenCalledWith({ url: 'https://flight.dev' });
  });
});
