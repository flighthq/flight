import type { EntityWithoutRuntime, Host } from '@flighthq/types/contract';

import { createEntity } from './entity';

export function createHost<Capabilities extends Partial<EntityWithoutRuntime<Host>>>(
  capabilities: Readonly<Capabilities> = {} as Capabilities,
): Host & Capabilities {
  return createEntity({
    accessibility: {},
    app: {},
    clipboard: {},
    connectivity: {},
    dialog: {},
    graphics: {},
    input: {},
    ipc: {},
    media: {},
    menu: {},
    midi: {},
    net: {},
    notification: {},
    power: {},
    protocol: {},
    screen: {},
    share: {},
    shell: {},
    shortcut: {},
    storage: {},
    system: {},
    text: {},
    tray: {},
    ui: {},
    updater: {},
    window: {},
    ...capabilities,
  });
}
