import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  App,
  AppActivationPolicy,
  AppLoginItem,
  AppLoginItemLike,
  AppPathKind,
  EntityConstruction,
  HostAppActivateCapability,
  HostAppActivationPolicyCapability,
  HostAppAllWindowsClosedCapability,
  HostAppBadgeCapability,
  HostAppDockCapability,
  HostAppFocusCapability,
  HostAppVisibilityQueryCapability,
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
  MenuItemTemplate,
} from '@flighthq/types/contract';

interface AppSubscriptions {
  activate?: () => void;
  allWindowsClosed?: () => void;
  openFile?: () => void;
  quitRequest?: () => void;
  ready?: () => void;
  secondInstance?: () => void;
}

export function addAppRecentDocument(
  hostAppRecentDocuments: Readonly<HostAppRecentDocumentsCapability>,
  path: string,
): void {
  hostAppRecentDocuments.addRecentDocument(path);
}

export function attachApp(
  hostAppActivate: Readonly<HostAppActivateCapability>,
  hostAppAllWindowsClosed: Readonly<HostAppAllWindowsClosedCapability>,
  hostAppOpenFile: Readonly<HostAppOpenFileCapability>,
  hostAppQuitRequest: Readonly<HostAppQuitRequestCapability>,
  hostAppReady: Readonly<HostAppReadyCapability>,
  hostAppSecondInstance: Readonly<HostAppSecondInstanceCapability>,
  app: App,
): void {
  detachApp(app);
  attachAppActivate(hostAppActivate, app);
  attachAppAllWindowsClosed(hostAppAllWindowsClosed, app);
  attachAppOpenFile(hostAppOpenFile, app);
  attachAppQuitRequest(hostAppQuitRequest, app);
  attachAppReady(hostAppReady, app);
  attachAppSecondInstance(hostAppSecondInstance, app);
}

export function attachAppActivate(hostAppActivate: Readonly<HostAppActivateCapability>, app: App): void {
  replaceAppSubscription(
    app,
    'activate',
    hostAppActivate.subscribe(() => emitSignal(app.onActivate)),
  );
}

export function attachAppAllWindowsClosed(
  hostAppAllWindowsClosed: Readonly<HostAppAllWindowsClosedCapability>,
  app: App,
): void {
  replaceAppSubscription(
    app,
    'allWindowsClosed',
    hostAppAllWindowsClosed.subscribe(() => emitSignal(app.onAllWindowsClosed)),
  );
}

export function attachAppOpenFile(hostAppOpenFile: Readonly<HostAppOpenFileCapability>, app: App): void {
  replaceAppSubscription(
    app,
    'openFile',
    hostAppOpenFile.subscribe((path) => emitSignal(app.onOpenFile, path)),
  );
}

export function attachAppQuitRequest(hostAppQuitRequest: Readonly<HostAppQuitRequestCapability>, app: App): void {
  replaceAppSubscription(
    app,
    'quitRequest',
    hostAppQuitRequest.subscribe((cancelHost) => {
      emitSignal(app.onQuitRequest);
      if (app.onQuitRequest.data?.cancelled === true) cancelHost();
    }),
  );
}

export function attachAppReady(hostAppReady: Readonly<HostAppReadyCapability>, app: App): void {
  replaceAppSubscription(
    app,
    'ready',
    hostAppReady.subscribe(() => emitSignal(app.onReady)),
  );
}

export function attachAppSecondInstance(
  hostAppSecondInstance: Readonly<HostAppSecondInstanceCapability>,
  app: App,
): void {
  replaceAppSubscription(
    app,
    'secondInstance',
    hostAppSecondInstance.subscribe((argv) => emitSignal(app.onSecondInstance, argv)),
  );
}

export function bounceAppDock(hostAppDock: Readonly<HostAppDockCapability>): number {
  return hostAppDock.bounceDock();
}

export function cancelAppAttention(hostAppDock: Readonly<HostAppDockCapability>, id: number): void {
  hostAppDock.cancelAttention(id);
}

export function cancelAppDockBounce(hostAppDock: Readonly<HostAppDockCapability>, id: number): void {
  hostAppDock.cancelDockBounce(id);
}

export function clearAppRecentDocuments(hostAppRecentDocuments: Readonly<HostAppRecentDocumentsCapability>): void {
  hostAppRecentDocuments.clearRecentDocuments();
}

export function createApp(): App {
  const out = allocateEntity<App>();
  initializeApp(out);
  return finishEntity(out);
}

export function detachApp(app: App): void {
  const subscriptions = _subscriptions.get(app);
  if (subscriptions === undefined) return;
  _subscriptions.delete(app);
  for (const unsubscribe of Object.values(subscriptions)) unsubscribe?.();
}

export function disposeApp(app: App): void {
  detachApp(app);
  clearSignal(app.onActivate);
  clearSignal(app.onAllWindowsClosed);
  clearSignal(app.onOpenFile);
  clearSignal(app.onQuitRequest);
  clearSignal(app.onReady);
  clearSignal(app.onSecondInstance);
}

export function focusApp(hostAppFocus: Readonly<HostAppFocusCapability>): void {
  hostAppFocus.focus();
}

export function getAppDirectoryPath(hostAppPath: Readonly<HostAppPathCapability>, kind: AppPathKind): string {
  return hostAppPath.getAppDirectoryPath(kind);
}

export function getAppExecutablePath(hostAppPath: Readonly<HostAppPathCapability>): string {
  return hostAppPath.getExecutablePath();
}

export function getAppLocale(hostAppLocale: Readonly<HostAppLocaleCapability>): string {
  return hostAppLocale.getLocale();
}

export function getAppLoginItem(hostAppLoginItem: Readonly<HostAppLoginItemCapability>): AppLoginItem {
  return hostAppLoginItem.getLoginItem();
}

export function getAppName(hostAppName: Readonly<HostAppNameCapability>): string {
  return hostAppName.getName();
}

export function getAppPath(hostAppPath: Readonly<HostAppPathCapability>): string {
  return hostAppPath.getAppPath();
}

export function getAppPreferredSystemLanguages(hostAppLocale: Readonly<HostAppLocaleCapability>): readonly string[] {
  return hostAppLocale.getPreferredSystemLanguages();
}

export function getAppSystemLocale(hostAppLocale: Readonly<HostAppLocaleCapability>): string {
  return hostAppLocale.getSystemLocale();
}

export function getAppVersion(hostAppVersion: Readonly<HostAppVersionCapability>): string {
  return hostAppVersion.getVersion();
}

export function hasAppSingleInstanceLock(hostAppSingleInstance: Readonly<HostAppSingleInstanceCapability>): boolean {
  return hostAppSingleInstance.hasSingleInstanceLock();
}

export function hideApp(hostAppHide: Readonly<HostAppHideCapability>): void {
  hostAppHide.hideApp();
}

export function initializeApp(out: EntityConstruction<App>): void {
  out.onActivate = createSignal();
  out.onAllWindowsClosed = createSignal();
  out.onOpenFile = createSignal();
  out.onQuitRequest = createSignal();
  out.onReady = createSignal();
  out.onSecondInstance = createSignal();
}

export function isAppHidden(hostAppVisibilityQuery: Readonly<HostAppVisibilityQueryCapability>): boolean {
  return hostAppVisibilityQuery.isAppHidden();
}

export function quitApp(hostAppQuit: Readonly<HostAppQuitCapability>): void {
  hostAppQuit.quit();
}

export function relaunchApp(hostAppRelaunch: Readonly<HostAppRelaunchCapability>): void {
  hostAppRelaunch.relaunch();
}

export function releaseAppSingleInstanceLock(hostAppSingleInstance: Readonly<HostAppSingleInstanceCapability>): void {
  hostAppSingleInstance.releaseSingleInstanceLock();
}

export function requestAppAttention(hostAppDock: Readonly<HostAppDockCapability>, critical: boolean): number {
  return hostAppDock.requestAttention(critical);
}

export function requestAppSingleInstanceLock(hostAppSingleInstance: Readonly<HostAppSingleInstanceCapability>): boolean {
  return hostAppSingleInstance.requestSingleInstanceLock();
}

export function setAppActivationPolicy(
  hostAppActivationPolicy: Readonly<HostAppActivationPolicyCapability>,
  policy: AppActivationPolicy,
): void {
  hostAppActivationPolicy.setActivationPolicy(policy);
}

export function setAppBadgeCount(hostAppBadge: Readonly<HostAppBadgeCapability>, count: number): Promise<boolean> {
  return hostAppBadge.setBadgeCount(count);
}

export function setAppDockBadge(hostAppDock: Readonly<HostAppDockCapability>, text: string): void {
  hostAppDock.setDockBadge(text);
}

export function setAppDockMenu(hostAppDock: Readonly<HostAppDockCapability>, items: readonly MenuItemTemplate[]): void {
  hostAppDock.setDockMenu(items);
}

export function setAppLoginItem(
  hostAppLoginItem: Readonly<HostAppLoginItemCapability>,
  settings: Readonly<AppLoginItemLike>,
): void {
  hostAppLoginItem.setLoginItem(settings);
}

export function setAppName(hostAppNameWrite: Readonly<HostAppNameWriteCapability>, name: string): void {
  hostAppNameWrite.setName(name);
}

export function setAppUserModelId(hostAppUserModelId: Readonly<HostAppUserModelIdCapability>, id: string): void {
  hostAppUserModelId.setUserModelId(id);
}

export function showApp(hostAppShow: Readonly<HostAppShowCapability>): void {
  hostAppShow.showApp();
}

const _subscriptions = new WeakMap<App, AppSubscriptions>();

function replaceAppSubscription(app: App, key: keyof AppSubscriptions, unsubscribe: () => void): void {
  const subscriptions = _subscriptions.get(app) ?? {};
  subscriptions[key]?.();
  subscriptions[key] = unsubscribe;
  _subscriptions.set(app, subscriptions);
}
