import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  AppUpdateCheckOutcome,
  AppUpdateInstallOutcome,
  DownloadedUpdate,
  HostUpdaterCommandProvider,
} from '@flighthq/types/contract';

import * as updaterContract from './contract';
import * as updaterPublic from './index';
import { checkForAppUpdate, destroyUpdater, installDownloadedUpdate } from './updater';

interface FakeBackend extends HostUpdaterCommandProvider {
  readonly calls: {
    check: number;
    destroy: number;
    install: DownloadedUpdate[];
  };
}

function downloadedUpdate(version = '1.2.3'): DownloadedUpdate {
  return Object.freeze({
    [EntityRuntimeKey]: undefined,
    info: Object.freeze({
      downloadSizeBytes: null,
      isMandatory: null,
      minimumOsVersion: null,
      notes: null,
      releaseDate: null,
      sha512: null,
      version,
    }),
  }) as DownloadedUpdate;
}

function fakeBackend(
  checkOutcome: AppUpdateCheckOutcome = { reason: 'not-available' },
  installOutcome: AppUpdateInstallOutcome = { reason: 'ok' },
): FakeBackend {
  const calls = { check: 0, destroy: 0, install: [] as DownloadedUpdate[] };
  return {
    [EntityRuntimeKey]: undefined,
    calls,
    async check() {
      calls.check++;
      return checkOutcome;
    },
    destroy() {
      calls.destroy++;
    },
    async install(update) {
      calls.install.push(update);
      return installOutcome;
    },
  };
}

function host(command: HostUpdaterCommandProvider): {
  readonly updater: { readonly command: HostUpdaterCommandProvider };
} {
  return { updater: { command } };
}

describe('checkForAppUpdate', () => {
  it('awaits exactly one explicit Host updater check', async () => {
    const backend = fakeBackend({ reason: 'not-available' });

    await expect(checkForAppUpdate(host(backend).updater.command)).resolves.toEqual({ reason: 'not-available' });
    expect(backend.calls.check).toBe(1);
  });

  it('does not invent error detail when a provider operation rejects', async () => {
    const backend = fakeBackend();
    backend.check = async () => {
      throw new Error('native detail must not leak through a portable outcome');
    };

    await expect(checkForAppUpdate(host(backend).updater.command)).resolves.toEqual({ reason: 'operation-failed' });
  });
});

describe('destroyUpdater', () => {
  it('destroys only the explicitly supplied provider', () => {
    const selected = fakeBackend();
    const other = fakeBackend();

    destroyUpdater(host(selected).updater.command);

    expect(selected.calls.destroy).toBe(1);
    expect(other.calls.destroy).toBe(0);
  });
});

describe('installDownloadedUpdate', () => {
  it('pins a downloaded handle to its originating provider across Host replacement', async () => {
    const update = downloadedUpdate();
    const origin = fakeBackend({ reason: 'downloaded', update });
    const replacement = fakeBackend();
    const checked = await checkForAppUpdate(host(origin).updater.command);
    if (checked.reason !== 'downloaded') throw new Error('expected downloaded update');

    await expect(installDownloadedUpdate(host(replacement).updater.command, checked.update)).resolves.toEqual({
      reason: 'ok',
    });
    expect(origin.calls.install).toEqual([update]);
    expect(replacement.calls.install).toEqual([]);
  });

  it('rejects an update handle that did not originate from a completed check', async () => {
    await expect(installDownloadedUpdate(host(fakeBackend()).updater.command, downloadedUpdate())).rejects.toThrow(
      TypeError,
    );
  });

  it('exports only the reduced transaction surface from both entry points', () => {
    const expected = ['checkForAppUpdate', 'destroyUpdater', 'installDownloadedUpdate'];

    expect(Object.keys(updaterPublic).sort()).toEqual(expected);
    expect(Object.keys(updaterContract).sort()).toEqual(expected);
  });
});
