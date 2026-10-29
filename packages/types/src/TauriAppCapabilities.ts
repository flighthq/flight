import type { HostAppCapabilities } from '@flighthq/app/contract';

export type TauriAppCapabilities = Required<
  Pick<HostAppCapabilities, 'hide' | 'locale' | 'name' | 'quit' | 'relaunch' | 'show' | 'version'>
>;
