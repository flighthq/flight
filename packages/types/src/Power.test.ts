import type { Entity } from './Entity';
import type { HostPowerCapabilities } from './Host';
import type {
  ElectronPowerCapabilities,
  HostPowerBatteryHealthCapability,
  HostPowerChangeCapability,
  HostPowerIdleCapability,
  HostPowerKeepAwakeCapability,
  HostPowerSessionLockCapability,
  HostPowerStatusCapability,
  HostPowerSuspensionCapability,
  HostPowerThermalCapability,
  WebPowerCapabilities,
  WebPowerReadingCapabilities,
} from './Power';

type PowerCapabilitiesAreStructural = [
  HostPowerBatteryHealthCapability extends Entity ? true : false,
  HostPowerChangeCapability extends Entity ? true : false,
  HostPowerIdleCapability extends Entity ? true : false,
  HostPowerKeepAwakeCapability extends Entity ? true : false,
  HostPowerSessionLockCapability extends Entity ? true : false,
  HostPowerStatusCapability extends Entity ? true : false,
  HostPowerSuspensionCapability extends Entity ? true : false,
  HostPowerThermalCapability extends Entity ? true : false,
];

type ConcretePowerBundlesAreStructural = [
  ElectronPowerCapabilities extends Entity ? true : false,
  WebPowerCapabilities extends Entity ? true : false,
  WebPowerReadingCapabilities extends Entity ? true : false,
];

type GenericPowerContractsAreStructural = [
  HostPowerCapabilities extends Entity ? true : false,
  { readonly power: { readonly batteryHealth: HostPowerBatteryHealthCapability } } extends Entity ? true : false,
  { readonly power: { readonly change: HostPowerChangeCapability } } extends Entity ? true : false,
  { readonly power: { readonly idle: HostPowerIdleCapability } } extends Entity ? true : false,
  { readonly power: { readonly keepAwake: HostPowerKeepAwakeCapability } } extends Entity ? true : false,
  { readonly power: { readonly sessionLock: HostPowerSessionLockCapability } } extends Entity ? true : false,
  { readonly power: { readonly status: HostPowerStatusCapability } } extends Entity ? true : false,
  { readonly power: { readonly suspension: HostPowerSuspensionCapability } } extends Entity ? true : false,
  { readonly power: { readonly thermal: HostPowerThermalCapability } } extends Entity ? true : false,
];

describe('power Entity boundaries', () => {
  it('keeps individual capabilities structural', () => {
    expectTypeOf<PowerCapabilitiesAreStructural>().toEqualTypeOf<
      [false, false, false, false, false, false, false, false]
    >();
  });

  it('keeps concrete platform bundles structural', () => {
    expectTypeOf<ConcretePowerBundlesAreStructural>().toEqualTypeOf<[false, false, false]>();
  });

  it('keeps generic host groups and Has traits structural', () => {
    expectTypeOf<GenericPowerContractsAreStructural>().toEqualTypeOf<
      [false, false, false, false, false, false, false, false, false]
    >();
  });
});
