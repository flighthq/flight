import type { Entity } from './Entity';
import type { HostPowerCapabilities } from './Host';
import type {
  ElectronPowerCapabilities,
  HostPowerBatteryHealthProvider,
  HostPowerChangeProvider,
  HostPowerIdleProvider,
  HostPowerKeepAwakeProvider,
  HostPowerSessionLockProvider,
  HostPowerStatusProvider,
  HostPowerSuspensionProvider,
  HostPowerThermalProvider,
  WebPowerCapabilities,
  WebPowerReadingCapabilities,
} from './Power';

type PowerProvidersAreEntities = [
  HostPowerBatteryHealthProvider extends Entity ? true : false,
  HostPowerChangeProvider extends Entity ? true : false,
  HostPowerIdleProvider extends Entity ? true : false,
  HostPowerKeepAwakeProvider extends Entity ? true : false,
  HostPowerSessionLockProvider extends Entity ? true : false,
  HostPowerStatusProvider extends Entity ? true : false,
  HostPowerSuspensionProvider extends Entity ? true : false,
  HostPowerThermalProvider extends Entity ? true : false,
];

type ConcretePowerBundlesAreEntities = [
  ElectronPowerCapabilities extends Entity ? true : false,
  WebPowerCapabilities extends Entity ? true : false,
  WebPowerReadingCapabilities extends Entity ? true : false,
];

type GenericPowerContractsAreStructural = [
  HostPowerCapabilities extends Entity ? true : false,
  { readonly power: { readonly batteryHealth: HostPowerBatteryHealthProvider } } extends Entity ? true : false,
  { readonly power: { readonly change: HostPowerChangeProvider } } extends Entity ? true : false,
  { readonly power: { readonly idle: HostPowerIdleProvider } } extends Entity ? true : false,
  { readonly power: { readonly keepAwake: HostPowerKeepAwakeProvider } } extends Entity ? true : false,
  { readonly power: { readonly sessionLock: HostPowerSessionLockProvider } } extends Entity ? true : false,
  { readonly power: { readonly status: HostPowerStatusProvider } } extends Entity ? true : false,
  { readonly power: { readonly suspension: HostPowerSuspensionProvider } } extends Entity ? true : false,
  { readonly power: { readonly thermal: HostPowerThermalProvider } } extends Entity ? true : false,
];

describe('power Entity boundaries', () => {
  it('makes individual providers and concrete platform bundles entities', () => {
    expectTypeOf<PowerProvidersAreEntities>().toEqualTypeOf<[true, true, true, true, true, true, true, true]>();
    expectTypeOf<ConcretePowerBundlesAreEntities>().toEqualTypeOf<[true, true, true]>();
  });

  it('keeps generic host groups and Has traits structural', () => {
    expectTypeOf<GenericPowerContractsAreStructural>().toEqualTypeOf<
      [false, false, false, false, false, false, false, false, false]
    >();
  });
});
