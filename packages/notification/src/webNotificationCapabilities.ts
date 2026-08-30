import { createWebNotificationCapabilities } from './notification';

// The standard browser provider is a module-scope Entity because its live Notification instances and
// schedule timers intentionally persist for the lifetime of webHost. It lives outside the factory source
// so the whole-host/store const path remains independently visible to the size gate.
export const webNotificationCapabilities = createWebNotificationCapabilities();
