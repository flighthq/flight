export {
  attachAppLifecycle,
  createAppLifecycle,
  detachAppLifecycle,
  disposeAppLifecycle,
  explainLifecycleOperation,
  getAppLaunchKind,
  getAppLifecycleState,
  hasLifecycleOperation,
  isAppActive,
  isAppBackground,
  isAppInactive,
  requestAppBack,
} from './lifecycle.ts';
export type {
  AppLaunchKind,
  AppLifecycle,
  AppLifecycleState,
  AppMemoryPressure,
  HostLifecycleCapabilities,
  HostLifecycleCapability,
  LifecycleOperation,
} from './contract.ts';
