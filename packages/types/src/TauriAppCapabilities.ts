import type { HostAppCapabilities } from './Host.ts';

export type TauriAppCapabilities = Required<
  Pick<HostAppCapabilities, 'hide' | 'locale' | 'name' | 'quit' | 'relaunch' | 'show' | 'version'>
>;
