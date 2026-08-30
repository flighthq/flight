import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHost } from './webHost';

describe('webHost', () => {
  it('is an Entity with exactly the genuine external Shell slot', () => {
    expect(EntityRuntimeKey in webHost).toBe(true);
    expect(Object.keys(webHost.shell)).toEqual(['external']);
    expect(EntityRuntimeKey in webHost.shell.external).toBe(true);
  });

  it('installs the Window persistence query and request slots without disturbing local storage', () => {
    expect(Object.keys(webHost.storage).sort()).toEqual(['change', 'local', 'persistenceQuery', 'persistenceRequest']);
  });
});
