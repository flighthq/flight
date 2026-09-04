import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
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
  ShellProcess,
  ShellProcessBackend,
  ShellProcessHost,
  ShellProcessOptions,
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
  spawnShellProcess,
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
      (() => {
        const out = allocateEntity<any>();
        out.moveToTrash = (path) => {
          paths.push(path);
          return new Promise((resolve) => resolvers.push(resolve));
        };
        return finishEntity(out);
      })(),
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
    await expect(
      moveShellItemToTrash(
        trashHost(
          (() => {
            const out = allocateEntity<any>();
            out.moveToTrash = moveToTrash;
            return finishEntity(out);
          })(),
        ),
        '/item',
      ),
    ).resolves.toEqual({
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
    const host = externalHost(
      (() => {
        const out = allocateEntity<any>();
        out.open = open;
        return finishEntity(out);
      })(),
    );
    await expect(openShellExternalUrl(host, 'file:///etc/passwd', { allowedSchemes: ['https'] })).resolves.toEqual({
      reason: 'blocked-scheme',
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps two live hosts isolated', async () => {
    const calls: string[] = [];
    const first = externalHost(
      (() => {
        const out = allocateEntity<any>();
        out.open = async (url) => {
          calls.push(`first:${url}`);
          return { reason: 'ok' };
        };
        return finishEntity(out);
      })(),
    );
    const second = externalHost(
      (() => {
        const out = allocateEntity<any>();
        out.open = async (url) => {
          calls.push(`second:${url}`);
          return { reason: 'operation-failed' };
        };
        return finishEntity(out);
      })(),
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
    const provider = allocateEntity<any>();
    provider.open = async () => {
      return { message: '', reason: 'operation-failed' as const };
    };
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
    await expect(
      revealShellPath(
        pathRevealHost(
          (() => {
            const out = allocateEntity<any>();
            out.reveal = reveal;
            return finishEntity(out);
          })(),
        ),
        '/item',
      ),
    ).resolves.toEqual({
      reason: 'operation-failed',
    });
  });
});

describe('shellBeep', () => {
  it('dispatches synchronously', () => {
    const beep = vi.fn();
    shellBeep(
      beepHost(
        (() => {
          const out = allocateEntity<any>();
          out.beep = beep;
          return finishEntity(out);
        })(),
      ),
    );
    expect(beep).toHaveBeenCalledOnce();
  });
});

describe('spawnShellProcess', () => {
  it('exposes the explicit host, command, argument-vector, and optional-options API', () => {
    expectTypeOf(spawnShellProcess).parameters.toEqualTypeOf<
      [ShellProcessHost, string, readonly string[], Readonly<ShellProcessOptions>?]
    >();
    expectTypeOf(spawnShellProcess).returns.toEqualTypeOf<ShellProcess | null>();
  });

  it('forwards the command, argument vector, and options to the host backend unchanged', () => {
    const process = shellProcess();
    const spawn = vi.fn(() => process);
    const host = processHost(
      (() => {
        const out = allocateEntity<any>();
        out.spawn = spawn;
        return finishEntity(out);
      })(),
    );
    const args = ['--flag', 'value'] as const;
    const options = { cwd: '/work', environment: { MODE: 'test' } } as const;

    expect(spawnShellProcess(host, '/bin/tool', args, options)).toBe(process);
    expect(spawn).toHaveBeenCalledWith('/bin/tool', args, options);
  });

  it('returns null when the host does not expose child-process support', () => {
    expect(spawnShellProcess({ shell: {} }, '/bin/tool', [])).toBeNull();
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

function processHost(process: ShellProcessBackend): ShellProcessHost {
  return { shell: { process } };
}

function shellProcess(): ShellProcess {
  const out = allocateEntity<any>();
  out.exit = Promise.resolve({ code: 0, signal: null });
  out.stderr = new ReadableStream<Uint8Array>();
  out.stdin = new WritableStream<Uint8Array>();
  out.stdout = new ReadableStream<Uint8Array>();
  out.terminate = vi.fn();
  return finishEntity(out);
}

function shortcutLinkHost(shortcutLink: ShellShortcutLinkBackend): HasShellShortcutLink {
  return { shell: { shortcutLink } };
}

function shortcutLinkProvider(): ShellShortcutLinkBackend & { write: ReturnType<typeof vi.fn> } {
  const out = allocateEntity<any>();
  out.read = async () => {
    return { link: { target: '/app' }, reason: 'ok' };
  };
  out.write = vi.fn(async () => ({ reason: 'ok' as const }));
  return finishEntity(out);
}

function trashHost(trash: ShellTrashBackend): HasShellTrash {
  return { shell: { trash } };
}
