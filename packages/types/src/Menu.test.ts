import type { Entity } from './Entity';
import type { HostMenuCapabilities } from './Host';
import type {
  ElectronMenuCapabilities,
  HostMenuApplicationCapability,
  HostMenuHighlightCapability,
  HostMenuPopupCapability,
  HostMenuSelectCapability,
  TauriMenuCapabilities,
} from './Menu';

type MenuProvidersAreEntities = [
  HostMenuApplicationCapability extends Entity ? true : false,
  HostMenuHighlightCapability extends Entity ? true : false,
  HostMenuPopupCapability extends Entity ? true : false,
  HostMenuSelectCapability extends Entity ? true : false,
];

type ConcreteMenuBundlesAreEntities = [
  ElectronMenuCapabilities extends Entity ? true : false,
  TauriMenuCapabilities extends Entity ? true : false,
];

type GenericMenuContractsAreStructural = [
  HostMenuCapabilities extends Entity ? true : false,
  { readonly menu: { readonly application: HostMenuApplicationCapability } } extends Entity ? true : false,
  { readonly menu: { readonly highlight: HostMenuHighlightCapability } } extends Entity ? true : false,
  { readonly menu: { readonly popup: HostMenuPopupCapability } } extends Entity ? true : false,
  { readonly menu: { readonly select: HostMenuSelectCapability } } extends Entity ? true : false,
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
