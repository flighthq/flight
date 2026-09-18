import type { Entity } from './Entity';
import type { HostMenuCapabilities } from './Host';
import type {
  ElectronMenuCapabilities,
  HostAppMenuCapability,
  HostMenuHighlightCapability,
  HostMenuPopupCapability,
  HostMenuSelectCapability,
  TauriMenuCapabilities,
} from './Menu';

type MenuCapabilitiesAreStructural = [
  HostAppMenuCapability extends Entity ? true : false,
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
  { readonly menu: { readonly application: HostAppMenuCapability } } extends Entity ? true : false,
  { readonly menu: { readonly highlight: HostMenuHighlightCapability } } extends Entity ? true : false,
  { readonly menu: { readonly popup: HostMenuPopupCapability } } extends Entity ? true : false,
  { readonly menu: { readonly select: HostMenuSelectCapability } } extends Entity ? true : false,
];

describe('menu Entity boundaries', () => {
  it('keeps individual capabilities structural', () => {
    expectTypeOf<MenuCapabilitiesAreStructural>().toEqualTypeOf<[false, false, false, false]>();
  });

  it('makes concrete platform bundles entities', () => {
    expectTypeOf<ConcreteMenuBundlesAreEntities>().toEqualTypeOf<[true, true]>();
  });

  it('keeps generic host groups and Has traits structural', () => {
    expectTypeOf<GenericMenuContractsAreStructural>().toEqualTypeOf<[false, false, false, false, false]>();
  });
});
