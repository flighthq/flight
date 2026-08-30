import type { PlatformName } from './Platform';

export interface ElectronBackendOptions {
  // Injected by the Electron entry point. Shell capability construction uses this fact to omit the
  // Windows-only shortcutLink slot without consulting process.platform or another ambient runtime.
  readonly platform: PlatformName;
  readonly storageFileName?: string;
  readonly updaterFeedUrl?: string;
}
