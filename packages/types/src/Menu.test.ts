import type { Entity } from './Entity';
import type { HasMenuApplication, HasMenuHighlight, HasMenuPopup, HasMenuSelect, HostMenuCapabilities } from './Host';
import type {
  ElectronMenuCapabilities,
  HostMenuApplicationProvider,
  HostMenuHighlightProvider,
  HostMenuPopupProvider,
  HostMenuSelectProvider,
  TauriMenuCapabilities,
} from './Menu';

type MenuProvidersAreEntities = [
  HostMenuApplicationProvider extends Entity ? true : false,
  HostMenuHighlightProvider extends Entity ? true : false,
  HostMenuPopupProvider extends Entity ? true : false,
  HostMenuSelectProvider extends Entity ? true : false,
];

type ConcreteMenuBundlesAreEntities = [
  ElectronMenuCapabilities extends Entity ? true : false,
  TauriMenuCapabilities extends Entity ? true : false,
];

type GenericMenuContractsAreStructural = [
  HostMenuCapabilities extends Entity ? true : false,
  HasMenuApplication extends Entity ? true : false,
  HasMenuHighlight extends Entity ? true : false,
  HasMenuPopup extends Entity ? true : false,
  HasMenuSelect extends Entity ? true : false,
];

describe('menu Entity boundaries', () => {
  it('makes individual providers and concrete platform bundles entities', () => {
    expectTypeOf<MenuProvidersAreEntities>().toEqualTypeOf<[true, true, true, true]>();
    expectTypeOf<ConcreteMenuBundlesAreEntities>().toEqualTypeOf<[true, true]>();
  });

  it('keeps generic host groups and Has traits structural', () => {
    expectTypeOf<GenericMenuContractsAreStructural>().toEqualTypeOf<[false, false, false, false, false]>();
  });
});
