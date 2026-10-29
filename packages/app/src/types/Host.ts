import type {
  HostAppActivateCapability,
  HostAppActivationPolicyCapability,
  HostAppAllWindowsClosedCapability,
  HostAppBadgeCapability,
  HostAppDockCapability,
  HostAppFocusCapability,
  HostAppHideCapability,
  HostAppLocaleCapability,
  HostAppLoginItemCapability,
  HostAppNameCapability,
  HostAppNameWriteCapability,
  HostAppOpenFileCapability,
  HostAppPathCapability,
  HostAppQuitCapability,
  HostAppQuitRequestCapability,
  HostAppReadyCapability,
  HostAppRecentDocumentsCapability,
  HostAppRelaunchCapability,
  HostAppSecondInstanceCapability,
  HostAppShowCapability,
  HostAppSingleInstanceCapability,
  HostAppUserModelIdCapability,
  HostAppVersionCapability,
} from './App.ts';
import type {
  HostWindowAppearanceCapability,
  HostWindowAttachCapability,
  HostWindowAttentionCapability,
  HostWindowContentProtectionCapability,
  HostWindowFocusCapability,
  HostWindowFullscreenCapability,
  HostWindowGeometryCapability,
  HostWindowHierarchyCapability,
  HostWindowLifecycleCapability,
  HostWindowProgressCapability,
  HostWindowShadowCapability,
  HostWindowShellCapability,
  HostWindowSizeConstraintsCapability,
  HostWindowStateCapability,
  HostWindowVisibilityCapability,
  HostWindowZOrderCapability,
} from './AppWindow.ts';
import type { HostAppExitCapability } from './HostAppExit.ts';
import type { HostAppLoopCapability } from './HostAppLoop.ts';
import type { HostElementFullscreenCapability } from './HostFullscreen.ts';

export interface HostAppCapabilities {
  readonly activate?: HostAppActivateCapability;
  readonly activationPolicy?: HostAppActivationPolicyCapability;
  readonly allWindowsClosed?: HostAppAllWindowsClosedCapability;
  readonly badge?: HostAppBadgeCapability;
  readonly dock?: HostAppDockCapability;
  readonly exit?: HostAppExitCapability;
  readonly focus?: HostAppFocusCapability;
  readonly hide?: HostAppHideCapability;
  readonly locale?: HostAppLocaleCapability;
  readonly loginItem?: HostAppLoginItemCapability;
  readonly loop?: HostAppLoopCapability;
  readonly name?: HostAppNameCapability;
  readonly nameWrite?: HostAppNameWriteCapability;
  readonly openFile?: HostAppOpenFileCapability;
  readonly path?: HostAppPathCapability;
  readonly quit?: HostAppQuitCapability;
  readonly quitRequest?: HostAppQuitRequestCapability;
  readonly ready?: HostAppReadyCapability;
  readonly recentDocuments?: HostAppRecentDocumentsCapability;
  readonly relaunch?: HostAppRelaunchCapability;
  readonly secondInstance?: HostAppSecondInstanceCapability;
  readonly show?: HostAppShowCapability;
  readonly singleInstance?: HostAppSingleInstanceCapability;
  readonly userModelId?: HostAppUserModelIdCapability;
  readonly version?: HostAppVersionCapability;
}

export interface HostFullscreenCapabilities {
  readonly element?: HostElementFullscreenCapability;
}

export interface HostWindowCapabilities {
  readonly appearance?: HostWindowAppearanceCapability;
  readonly attach?: HostWindowAttachCapability;
  readonly attention?: HostWindowAttentionCapability;
  readonly contentProtection?: HostWindowContentProtectionCapability;
  readonly focus?: HostWindowFocusCapability;
  readonly fullscreen?: HostWindowFullscreenCapability;
  readonly geometry?: HostWindowGeometryCapability;
  readonly hierarchy?: HostWindowHierarchyCapability;
  readonly lifecycle?: HostWindowLifecycleCapability;
  readonly progress?: HostWindowProgressCapability;
  readonly shadow?: HostWindowShadowCapability;
  readonly shell?: HostWindowShellCapability;
  readonly sizeConstraints?: HostWindowSizeConstraintsCapability;
  readonly state?: HostWindowStateCapability;
  readonly visibility?: HostWindowVisibilityCapability;
  readonly zOrder?: HostWindowZOrderCapability;
}
