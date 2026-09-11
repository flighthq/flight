import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  App,
  AppActivationPolicy,
  AppLoginItem,
  AppLoginItemLike,
  AppPathKind,
  EntityConstruction,
  HostAppActivateProvider,
  HostAppActivationPolicyProvider,
  HostAppAllWindowsClosedProvider,
  HostAppBadgeProvider,
  HostAppDockProvider,
  HostAppFocusProvider,
  HostAppVisibilityQueryProvider,
  HostAppHideProvider,
  HostAppLocaleProvider,
  HostAppLoginItemProvider,
  HostAppNameProvider,
  HostAppNameWriteProvider,
  HostAppOpenFileProvider,
  HostAppPathProvider,
  HostAppQuitProvider,
  HostAppQuitRequestProvider,
  HostAppReadyProvider,
  HostAppRecentDocumentsProvider,
  HostAppRelaunchProvider,
  HostAppSecondInstanceProvider,
  HostAppShowProvider,
  HostAppSingleInstanceProvider,
  HostAppUserModelIdProvider,
  HostAppVersionProvider,
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
  hostAppRecentDocuments: Readonly<HostAppRecentDocumentsProvider>,
  path: string,
): void {
  hostAppRecentDocuments.addRecentDocument(path);
}

export function attachApp(
  hostAppActivate: Readonly<HostAppActivateProvider>,
  hostAppAllWindowsClosed: Readonly<HostAppAllWindowsClosedProvider>,
  hostAppOpenFile: Readonly<HostAppOpenFileProvider>,
  hostAppQuitRequest: Readonly<HostAppQuitRequestProvider>,
  hostAppReady: Readonly<HostAppReadyProvider>,
  hostAppSecondInstance: Readonly<HostAppSecondInstanceProvider>,
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

export function attachAppActivate(hostAppActivate: Readonly<HostAppActivateProvider>, app: App): void {
  replaceAppSubscription(
    app,
    'activate',
    hostAppActivate.subscribe(() => emitSignal(app.onActivate)),
  );
}

export function attachAppAllWindowsClosed(
  hostAppAllWindowsClosed: Readonly<HostAppAllWindowsClosedProvider>,
  app: App,
): void {
  replaceAppSubscription(
    app,
    'allWindowsClosed',
    hostAppAllWindowsClosed.subscribe(() => emitSignal(app.onAllWindowsClosed)),
  );
}

export function attachAppOpenFile(hostAppOpenFile: Readonly<HostAppOpenFileProvider>, app: App): void {
  replaceAppSubscription(
    app,
    'openFile',
    hostAppOpenFile.subscribe((path) => emitSignal(app.onOpenFile, path)),
  );
}

export function attachAppQuitRequest(hostAppQuitRequest: Readonly<HostAppQuitRequestProvider>, app: App): void {
  replaceAppSubscription(
    app,
    'quitRequest',
    hostAppQuitRequest.subscribe((cancelHost) => {
      emitSignal(app.onQuitRequest);
      if (app.onQuitRequest.data?.cancelled === true) cancelHost();
    }),
  );
}

export function attachAppReady(hostAppReady: Readonly<HostAppReadyProvider>, app: App): void {
  replaceAppSubscription(
    app,
    'ready',
    hostAppReady.subscribe(() => emitSignal(app.onReady)),
  );
}

export function attachAppSecondInstance(
  hostAppSecondInstance: Readonly<HostAppSecondInstanceProvider>,
  app: App,
): void {
  replaceAppSubscription(
    app,
    'secondInstance',
    hostAppSecondInstance.subscribe((argv) => emitSignal(app.onSecondInstance, argv)),
  );
}

export function bounceAppDock(hostAppDock: Readonly<HostAppDockProvider>): number {
  return hostAppDock.bounceDock();
}

export function cancelAppAttention(hostAppDock: Readonly<HostAppDockProvider>, id: number): void {
  hostAppDock.cancelAttention(id);
}

export function cancelAppDockBounce(hostAppDock: Readonly<HostAppDockProvider>, id: number): void {
  hostAppDock.cancelDockBounce(id);
}

export function clearAppRecentDocuments(hostAppRecentDocuments: Readonly<HostAppRecentDocumentsProvider>): void {
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

export function focusApp(hostAppFocus: Readonly<HostAppFocusProvider>): void {
  hostAppFocus.focus();
}

export function getAppDirectoryPath(hostAppPath: Readonly<HostAppPathProvider>, kind: AppPathKind): string {
  return hostAppPath.getAppDirectoryPath(kind);
}

export function getAppExecutablePath(hostAppPath: Readonly<HostAppPathProvider>): string {
  return hostAppPath.getExecutablePath();
}

export function getAppLocale(hostAppLocale: Readonly<HostAppLocaleProvider>): string {
  return hostAppLocale.getLocale();
}

export function getAppLoginItem(hostAppLoginItem: Readonly<HostAppLoginItemProvider>): AppLoginItem {
  return hostAppLoginItem.getLoginItem();
}

export function getAppName(hostAppName: Readonly<HostAppNameProvider>): string {
  return hostAppName.getName();
}

export function getAppPath(hostAppPath: Readonly<HostAppPathProvider>): string {
  return hostAppPath.getAppPath();
}

export function getAppPreferredSystemLanguages(hostAppLocale: Readonly<HostAppLocaleProvider>): readonly string[] {
  return hostAppLocale.getPreferredSystemLanguages();
}

export function getAppSystemLocale(hostAppLocale: Readonly<HostAppLocaleProvider>): string {
  return hostAppLocale.getSystemLocale();
}

export function getAppVersion(hostAppVersion: Readonly<HostAppVersionProvider>): string {
  return hostAppVersion.getVersion();
}

export function hasAppSingleInstanceLock(hostAppSingleInstance: Readonly<HostAppSingleInstanceProvider>): boolean {
  return hostAppSingleInstance.hasSingleInstanceLock();
}

export function hideApp(hostAppHide: Readonly<HostAppHideProvider>): void {
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

export function isAppHidden(hostAppVisibilityQuery: Readonly<HostAppVisibilityQueryProvider>): boolean {
  return hostAppVisibilityQuery.isAppHidden();
}

export function quitApp(hostAppQuit: Readonly<HostAppQuitProvider>): void {
  hostAppQuit.quit();
}

export function relaunchApp(hostAppRelaunch: Readonly<HostAppRelaunchProvider>): void {
  hostAppRelaunch.relaunch();
}

export function releaseAppSingleInstanceLock(hostAppSingleInstance: Readonly<HostAppSingleInstanceProvider>): void {
  hostAppSingleInstance.releaseSingleInstanceLock();
}

export function requestAppAttention(hostAppDock: Readonly<HostAppDockProvider>, critical: boolean): number {
  return hostAppDock.requestAttention(critical);
}

export function requestAppSingleInstanceLock(hostAppSingleInstance: Readonly<HostAppSingleInstanceProvider>): boolean {
  return hostAppSingleInstance.requestSingleInstanceLock();
}

export function setAppActivationPolicy(
  hostAppActivationPolicy: Readonly<HostAppActivationPolicyProvider>,
  policy: AppActivationPolicy,
): void {
  hostAppActivationPolicy.setActivationPolicy(policy);
}

export function setAppBadgeCount(hostAppBadge: Readonly<HostAppBadgeProvider>, count: number): Promise<boolean> {
  return hostAppBadge.setBadgeCount(count);
}

export function setAppDockBadge(hostAppDock: Readonly<HostAppDockProvider>, text: string): void {
  hostAppDock.setDockBadge(text);
}

export function setAppDockMenu(hostAppDock: Readonly<HostAppDockProvider>, items: readonly MenuItemTemplate[]): void {
  hostAppDock.setDockMenu(items);
}

export function setAppLoginItem(
  hostAppLoginItem: Readonly<HostAppLoginItemProvider>,
  settings: Readonly<AppLoginItemLike>,
): void {
  hostAppLoginItem.setLoginItem(settings);
}

export function setAppName(hostAppNameWrite: Readonly<HostAppNameWriteProvider>, name: string): void {
  hostAppNameWrite.setName(name);
}

export function setAppUserModelId(hostAppUserModelId: Readonly<HostAppUserModelIdProvider>, id: string): void {
  hostAppUserModelId.setUserModelId(id);
}

export function showApp(hostAppShow: Readonly<HostAppShowProvider>): void {
  hostAppShow.showApp();
}

const _subscriptions = new WeakMap<App, AppSubscriptions>();

function replaceAppSubscription(app: App, key: keyof AppSubscriptions, unsubscribe: () => void): void {
  const subscriptions = _subscriptions.get(app) ?? {};
  subscriptions[key]?.();
  subscriptions[key] = unsubscribe;
  _subscriptions.set(app, subscriptions);
}
