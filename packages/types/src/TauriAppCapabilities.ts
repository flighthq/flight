import type { HostAppCapabilities } from './Host';

export type TauriAppCapabilities = Required<
  Pick<HostAppCapabilities, 'hide' | 'locale' | 'name' | 'quit' | 'relaunch' | 'show' | 'version'>
>;
