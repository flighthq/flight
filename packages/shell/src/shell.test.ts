import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityRuntimeKey,
  HasShellBeep,
  HasShellExternal,
  HasShellPathOpen,
  HasShellPathReveal,
  HasShellShortcutLink,
  HasShellTrash,
  ShellBeepBackend,
  ShellExternalBackend,
  ShellExternalUrlPolicy,
  ShellPathOpenBackend,
  ShellPathRevealBackend,
  ShellShortcutLinkBackend,
  ShellTrashBackend,
} from '@flighthq/types/contract';

import {
  isShellUrlAllowed,
  moveShellItemsToTrash,
  moveShellItemToTrash,
  openShellExternalUrl,
  openShellPath,
  readShellShortcutLink,
  revealShellPath,
  shellBeep,
  writeShellShortcutLink,
} from './shell';

describe('isShellUrlAllowed', () => {
  it('matches schemes case-insensitively from an explicit policy', () => {
    expect(isShellUrlAllowed('https://example.test', { allowedSchemes: ['HTTPS'] })).toBe(true);
    expect(isShellUrlAllowed('mailto:user@example.test', { allowedSchemes: ['https'] })).toBe(false);
  });

  it('blocks malformed URLs and an empty policy', () => {
    expect(isShellUrlAllowed('not a URL', { allowedSchemes: ['https'] })).toBe(false);
    expect(isShellUrlAllowed('https://example.test', { allowedSchemes: [] })).toBe(false);
  });
});

describe('moveShellItemsToTrash', () => {
  it('starts every one-path operation and preserves input order while awaiting all results', async () => {
    const paths: string[] = [];
    const resolvers: Array<(outcome: { reason: 'ok' | 'operation-failed' }) => void> = [];
    const host = trashHost(
      createEntity({
        moveToTrash(path) {
          paths.push(path);
          return new Promise((resolve) => resolvers.push(resolve));
        },
      } satisfies Omit<ShellTrashBackend, typeof EntityRuntimeKey>),
    );

    const outcomes = moveShellItemsToTrash(host, ['/first', '/second']);
    expect(paths).toEqual(['/first', '/second']);
    resolvers[1]?.({ reason: 'operation-failed' });
    let settled = false;
    void outcomes.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolvers[0]?.({ reason: 'ok' });
    await expect(outcomes).resolves.toEqual([{ reason: 'ok' }, { reason: 'operation-failed' }]);
  });
});

describe('moveShellItemToTrash', () => {
  it('routes through the supplied trash provider', async () => {
    const moveToTrash = vi.fn(async () => ({ reason: 'ok' as const }));
    await expect(moveShellItemToTrash(trashHost(createEntity({ moveToTrash })), '/item')).resolves.toEqual({
      reason: 'ok',
    });
    expect(moveToTrash).toHaveBeenCalledWith('/item');
  });
});

describe('openShellExternalUrl', () => {
  it('requires policy as the third parameter at the type boundary', () => {
    expectTypeOf(openShellExternalUrl).parameters.toEqualTypeOf<
      [HasShellExternal, string, Readonly<ShellExternalUrlPolicy>]
    >();
  });

  it('blocks before dispatch when the scheme is not allowed', async () => {
    const open = vi.fn(async () => ({ reason: 'ok' as const }));
    const host = externalHost(createEntity({ open }));
    await expect(openShellExternalUrl(host, 'file:///etc/passwd', { allowedSchemes: ['https'] })).resolves.toEqual({
      reason: 'blocked-scheme',
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps two live hosts isolated', async () => {
    const calls: string[] = [];
    const first = externalHost(
      createEntity({
        async open(url) {
          calls.push(`first:${url}`);
          return { reason: 'ok' };
        },
      } satisfies Omit<ShellExternalBackend, typeof EntityRuntimeKey>),
    );
    const second = externalHost(
      createEntity({
        async open(url) {
          calls.push(`second:${url}`);
          return { reason: 'operation-failed' };
        },
      } satisfies Omit<ShellExternalBackend, typeof EntityRuntimeKey>),
    );
    await expect(openShellExternalUrl(first, 'https://one.test', HTTPS_ONLY)).resolves.toEqual({ reason: 'ok' });
    await expect(openShellExternalUrl(second, 'https://two.test', HTTPS_ONLY)).resolves.toEqual({
      reason: 'operation-failed',
    });
    expect(calls).toEqual(['first:https://one.test', 'second:https://two.test']);
  });
});

describe('openShellPath', () => {
  it('preserves a provider failure and its message', async () => {
    const provider = createEntity({
      async open() {
        return { message: '', reason: 'operation-failed' as const };
      },
    });
    await expect(openShellPath(pathOpenHost(provider), '/missing')).resolves.toEqual({
      message: '',
      reason: 'operation-failed',
    });
  });
});

describe('readShellShortcutLink', () => {
  it('returns the read-specific outcome', async () => {
    const provider = shortcutLinkProvider();
    await expect(readShellShortcutLink(shortcutLinkHost(provider), '/app.lnk')).resolves.toEqual({
      link: { target: '/app' },
      reason: 'ok',
    });
  });
});

describe('revealShellPath', () => {
  it('returns the reveal-specific outcome', async () => {
    const reveal = vi.fn(async () => ({ reason: 'operation-failed' as const }));
    await expect(revealShellPath(pathRevealHost(createEntity({ reveal })), '/item')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });
});

describe('shellBeep', () => {
  it('dispatches synchronously', () => {
    const beep = vi.fn();
    shellBeep(beepHost(createEntity({ beep })));
    expect(beep).toHaveBeenCalledOnce();
  });
});

describe('writeShellShortcutLink', () => {
  it('requires an explicit write operation and returns the write-specific outcome', async () => {
    const provider = shortcutLinkProvider();
    await expect(
      writeShellShortcutLink(shortcutLinkHost(provider), '/app.lnk', { target: '/app' }, 'replace'),
    ).resolves.toEqual({ reason: 'ok' });
    expect(provider.write).toHaveBeenCalledWith('/app.lnk', { target: '/app' }, 'replace');
  });
});

const HTTPS_ONLY: ShellExternalUrlPolicy = { allowedSchemes: ['https'] };

function beepHost(beep: ShellBeepBackend): HasShellBeep {
  return { shell: { beep } };
}

function externalHost(external: ShellExternalBackend): HasShellExternal {
  return { shell: { external } };
}

function pathOpenHost(pathOpen: ShellPathOpenBackend): HasShellPathOpen {
  return { shell: { pathOpen } };
}

function pathRevealHost(pathReveal: ShellPathRevealBackend): HasShellPathReveal {
  return { shell: { pathReveal } };
}

function shortcutLinkHost(shortcutLink: ShellShortcutLinkBackend): HasShellShortcutLink {
  return { shell: { shortcutLink } };
}

function shortcutLinkProvider(): ShellShortcutLinkBackend & { write: ReturnType<typeof vi.fn> } {
  return createEntity({
    async read() {
      return { link: { target: '/app' }, reason: 'ok' };
    },
    write: vi.fn(async () => ({ reason: 'ok' as const })),
  } satisfies Omit<ShellShortcutLinkBackend, typeof EntityRuntimeKey>);
}

function trashHost(trash: ShellTrashBackend): HasShellTrash {
  return { shell: { trash } };
}
