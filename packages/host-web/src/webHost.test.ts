import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHost } from './webHost';

describe('webHost', () => {
  it('is an Entity with exactly the genuine external Shell slot', () => {
    expect(EntityRuntimeKey in webHost).toBe(true);
    expect(Object.keys(webHost.shell)).toEqual(['external']);
    expect(EntityRuntimeKey in webHost.shell.external).toBe(true);
  });
});
