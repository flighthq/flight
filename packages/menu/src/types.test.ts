import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRuntime } from '@flighthq/entity/contract';

import type {
  ElectronMenuCapabilities,
  HostAppMenuCapability,
  HostMenuCapabilities,
  HostMenuHighlightCapability,
  HostMenuPopupCapability,
  HostMenuSelectCapability,
  MenuHighlight,
  MenuSelect,
  MenuSignals,
  TauriMenuCapabilities,
} from './types.ts';

type EntityCompatibility = { readonly [EntityRuntimeKey]: EntityRuntime | undefined };

type MenuCapabilitiesAreStructural = [
  HostAppMenuCapability extends EntityCompatibility ? true : false,
  HostMenuHighlightCapability extends EntityCompatibility ? true : false,
  HostMenuPopupCapability extends EntityCompatibility ? true : false,
  HostMenuSelectCapability extends EntityCompatibility ? true : false,
];

type ConcreteMenuBundlesAreStructural = [
  ElectronMenuCapabilities extends EntityCompatibility ? true : false,
  TauriMenuCapabilities extends EntityCompatibility ? true : false,
];

describe('menu Entity boundaries', () => {
  it('keeps provider capabilities and platform bundles structural', () => {
    expectTypeOf<MenuCapabilitiesAreStructural>().toEqualTypeOf<[false, false, false, false]>();
    expectTypeOf<ConcreteMenuBundlesAreStructural>().toEqualTypeOf<[false, false]>();
    expectTypeOf<HostMenuCapabilities extends EntityCompatibility ? true : false>().toEqualTypeOf<false>();
  });

  it('keeps signal-bearing menu records as entities', () => {
    expectTypeOf<MenuHighlight>().toMatchTypeOf<EntityCompatibility>();
    expectTypeOf<MenuSelect>().toMatchTypeOf<EntityCompatibility>();
    expectTypeOf<MenuSignals>().toMatchTypeOf<EntityCompatibility>();
  });
});
