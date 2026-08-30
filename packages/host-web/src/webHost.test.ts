import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHost } from './webHost';

describe('webHost', () => {
  it('is an Entity with exactly the genuine external Shell slot', () => {
    expect(EntityRuntimeKey in webHost).toBe(true);
    expect(Object.keys(webHost.shell)).toEqual(['external']);
    expect(EntityRuntimeKey in webHost.shell.external).toBe(true);
  });

  it('publishes explicit storage providers including the honest OPFS surface', () => {
    expect(Object.keys(webHost.storage).sort()).toEqual([
      'change',
      'fileSystem',
      'local',
      'persistenceQuery',
      'persistenceRequest',
    ]);
  });

  it('publishes Web theme color without native status-bar claims', () => {
    expect(Object.keys(webHost.ui).sort()).toEqual(['fullscreen', 'statusBarColor']);
  });
});
