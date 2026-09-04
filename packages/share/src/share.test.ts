import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HasShareContent,
  HasShareFiles,
  ShareContent,
  ShareContentBackend,
  ShareFilesBackend,
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
  shareContent,
  shareContentWithResult,
  shareFiles,
  shareText,
  shareUrl,
} from './share';

type ContentImplementation = Omit<ShareContentBackend, typeof EntityRuntimeKey>;
type FilesImplementation = Omit<ShareFilesBackend, typeof EntityRuntimeKey>;

function contentHost(overrides: Partial<ContentImplementation> = {}): HasShareContent {
  return {
    share: {
      content: (() => {
        const out = allocateEntity<ContentImplementation>();
        out.canShareContent = () => true;
        out.shareContent = async () => true;
        out.shareContentWithResult = async () => ({ activityType: null, completed: true, dismissed: false });
        Object.assign(out, overrides);
        return finishEntity(out);
      })(),
    },
  };
}

function filesHost(overrides: Partial<FilesImplementation> = {}): HasShareFiles {
  return {
    share: {
      files: (() => {
        const out = allocateEntity<FilesImplementation>();
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

    expect(await shareContentWithResult(host, { title: 'flight' })).toEqual(result);
    expect(listener).toHaveBeenCalledWith(result);
    detachShareSignals(signals);
  });
});

describe('canShareContent', () => {
  it('validates meaningful payloads through the selected content slot', () => {
    const can = vi.fn(() => true);
    const host = contentHost({ canShareContent: can });
    expect(canShareContent(host, { text: 'hello' })).toBe(true);
    expect(can).toHaveBeenCalledWith({ text: 'hello' });

    // @ts-expect-error an empty object is not a meaningful Share content payload
    expect(canShareContent(contentHost(), {})).toBe(false);
  });
});

describe('canShareFiles', () => {
  it('validates through the files slot only for non-empty lists', () => {
    const host = filesHost();
    expect(canShareFiles(host, [file])).toBe(true);
    expect(canShareFiles(host, [])).toBe(false);
  });
});

describe('detachShareSignals', () => {
  it('stops delivery without clearing the signal Entity', async () => {
    const signals = enableShareSignals();
    const listener = vi.fn();
    connectSignal(signals.onShareResult, listener);
    attachShareSignals(signals);
    detachShareSignals(signals);
    await shareContentWithResult(contentHost(), { title: 'quiet' });
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
    await shareContentWithResult(contentHost(), { text: 'quiet' });
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
    expect(canShareContent(host, empty)).toBe(false);
    expect(await shareContent(host, empty)).toBe(false);
    expect(backend).not.toHaveBeenCalled();
  });
});

describe('shareContentWithResult', () => {
  it('returns a detailed provider outcome', async () => {
    const result: ShareResult = { activityType: 'mail', completed: true, dismissed: false };
    const host = contentHost({ shareContentWithResult: async () => result });
    expect(await shareContentWithResult(host, { title: 'flight' })).toEqual(result);
  });
});

describe('shareFiles', () => {
  it('dispatches a non-empty portable file tuple', async () => {
    const invoke = vi.fn(async (_content: Parameters<ShareFilesBackend['shareContent']>[0]) => true);
    const host = filesHost({ shareContent: invoke });
    expect(await shareFiles(host, [file])).toBe(true);
    expect(await shareFiles(host, [])).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0].files).toEqual([file]);
  });
});

describe('shareText', () => {
  it('delegates text through the content slot', async () => {
    const invoke = vi.fn(async (_content: Parameters<ShareContentBackend['shareContent']>[0]) => true);
    expect(await shareText(contentHost({ shareContent: invoke }), 'hello')).toBe(true);
    expect(invoke).toHaveBeenCalledWith({ text: 'hello' });
  });
});

describe('shareUrl', () => {
  it('delegates a URL through the content slot', async () => {
    const invoke = vi.fn(async (_content: Parameters<ShareContentBackend['shareContent']>[0]) => true);
    expect(await shareUrl(contentHost({ shareContent: invoke }), 'https://flight.dev')).toBe(true);
    expect(invoke).toHaveBeenCalledWith({ url: 'https://flight.dev' });
  });
});
