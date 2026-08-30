import { createEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  App,
  AppActivationPolicy,
  AppLoginItem,
  AppLoginItemLike,
  AppPathKind,
  HasAppActivate,
  HasAppActivationPolicy,
  HasAppAllWindowsClosed,
  HasAppBadge,
  HasAppDock,
  HasAppFocus,
  HasAppHiddenQuery,
  HasAppHide,
  HasAppLocale,
  HasAppLoginItem,
  HasAppName,
  HasAppNameWrite,
  HasAppOpenFile,
  HasAppPath,
  HasAppQuit,
  HasAppQuitRequest,
  HasAppReady,
  HasAppRecentDocuments,
  HasAppRelaunch,
  HasAppSecondInstance,
  HasAppShow,
  HasAppSingleInstance,
  HasAppUserModelId,
  HasAppVersion,
  MenuItemTemplate,
} from '@flighthq/types/contract';

type HasAllAppEvents = HasAppActivate &
  HasAppAllWindowsClosed &
  HasAppOpenFile &
  HasAppQuitRequest &
  HasAppReady &
  HasAppSecondInstance;

interface AppSubscriptions {
  activate?: () => void;
  allWindowsClosed?: () => void;
  openFile?: () => void;
  quitRequest?: () => void;
  ready?: () => void;
  secondInstance?: () => void;
}

export function addAppRecentDocument(host: HasAppRecentDocuments, path: string): void {
  host.app.recentDocuments.addRecentDocument(path);
}

export function attachApp(host: HasAllAppEvents, app: App): void {
  detachApp(app);
  attachAppActivate(host, app);
  attachAppAllWindowsClosed(host, app);
  attachAppOpenFile(host, app);
  attachAppQuitRequest(host, app);
  attachAppReady(host, app);
  attachAppSecondInstance(host, app);
}

export function attachAppActivate(host: HasAppActivate, app: App): void {
  replaceAppSubscription(
    app,
    'activate',
    host.app.activate.subscribe(() => emitSignal(app.onActivate)),
  );
}

export function attachAppAllWindowsClosed(host: HasAppAllWindowsClosed, app: App): void {
  replaceAppSubscription(
    app,
    'allWindowsClosed',
    host.app.allWindowsClosed.subscribe(() => emitSignal(app.onAllWindowsClosed)),
  );
}

export function attachAppOpenFile(host: HasAppOpenFile, app: App): void {
  replaceAppSubscription(
    app,
    'openFile',
    host.app.openFile.subscribe((path) => emitSignal(app.onOpenFile, path)),
  );
}

export function attachAppQuitRequest(host: HasAppQuitRequest, app: App): void {
  replaceAppSubscription(
    app,
    'quitRequest',
    host.app.quitRequest.subscribe((cancelHost) => {
      emitSignal(app.onQuitRequest);
      if (app.onQuitRequest.data?.cancelled === true) cancelHost();
    }),
  );
}

export function attachAppReady(host: HasAppReady, app: App): void {
  replaceAppSubscription(
    app,
    'ready',
    host.app.ready.subscribe(() => emitSignal(app.onReady)),
  );
}

export function attachAppSecondInstance(host: HasAppSecondInstance, app: App): void {
  replaceAppSubscription(
    app,
    'secondInstance',
    host.app.secondInstance.subscribe((argv) => emitSignal(app.onSecondInstance, argv)),
  );
}

export function bounceAppDock(host: HasAppDock): number {
  return host.app.dock.bounceDock();
}

export function cancelAppAttention(host: HasAppDock, id: number): void {
  host.app.dock.cancelAttention(id);
}

export function cancelAppDockBounce(host: HasAppDock, id: number): void {
  host.app.dock.cancelDockBounce(id);
}

export function clearAppRecentDocuments(host: HasAppRecentDocuments): void {
  host.app.recentDocuments.clearRecentDocuments();
}

export function createApp(): App {
  return createEntity({
    onActivate: createSignal(),
    onAllWindowsClosed: createSignal(),
    onOpenFile: createSignal(),
    onQuitRequest: createSignal(),
    onReady: createSignal(),
    onSecondInstance: createSignal(),
  });
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

export function focusApp(host: HasAppFocus): void {
  host.app.focus.focus();
}

export function getAppDirectoryPath(host: HasAppPath, kind: AppPathKind): string {
  return host.app.path.getAppDirectoryPath(kind);
}

export function getAppExecutablePath(host: HasAppPath): string {
  return host.app.path.getExecutablePath();
}

export function getAppLocale(host: HasAppLocale): string {
  return host.app.locale.getLocale();
}

export function getAppLoginItem(host: HasAppLoginItem): AppLoginItem {
  return host.app.loginItem.getLoginItem();
}

export function getAppName(host: HasAppName): string {
  return host.app.name.getName();
}

export function getAppPath(host: HasAppPath): string {
  return host.app.path.getAppPath();
}

export function getAppPreferredSystemLanguages(host: HasAppLocale): readonly string[] {
  return host.app.locale.getPreferredSystemLanguages();
}

export function getAppSystemLocale(host: HasAppLocale): string {
  return host.app.locale.getSystemLocale();
}

export function getAppVersion(host: HasAppVersion): string {
  return host.app.version.getVersion();
}

export function hasAppSingleInstanceLock(host: HasAppSingleInstance): boolean {
  return host.app.singleInstance.hasSingleInstanceLock();
}

export function hideApp(host: HasAppHide): void {
  host.app.hide.hideApp();
}

export function isAppHidden(host: HasAppHiddenQuery): boolean {
  return host.app.hiddenQuery.isAppHidden();
}

export function quitApp(host: HasAppQuit): void {
  host.app.quit.quit();
}

export function relaunchApp(host: HasAppRelaunch): void {
  host.app.relaunch.relaunch();
}

export function releaseAppSingleInstanceLock(host: HasAppSingleInstance): void {
  host.app.singleInstance.releaseSingleInstanceLock();
}

export function requestAppAttention(host: HasAppDock, critical: boolean): number {
  return host.app.dock.requestAttention(critical);
}

export function requestAppSingleInstanceLock(host: HasAppSingleInstance): boolean {
  return host.app.singleInstance.requestSingleInstanceLock();
}

export function setAppActivationPolicy(host: HasAppActivationPolicy, policy: AppActivationPolicy): void {
  host.app.activationPolicy.setActivationPolicy(policy);
}

export function setAppBadgeCount(host: HasAppBadge, count: number): Promise<boolean> {
  return host.app.badge.setBadgeCount(count);
}

export function setAppDockBadge(host: HasAppDock, text: string): void {
  host.app.dock.setDockBadge(text);
}

export function setAppDockMenu(host: HasAppDock, items: readonly MenuItemTemplate[]): void {
  host.app.dock.setDockMenu(items);
}

export function setAppLoginItem(host: HasAppLoginItem, settings: Readonly<AppLoginItemLike>): void {
  host.app.loginItem.setLoginItem(settings);
}

export function setAppName(host: HasAppNameWrite, name: string): void {
  host.app.nameWrite.setName(name);
}

export function setAppUserModelId(host: HasAppUserModelId, id: string): void {
  host.app.userModelId.setUserModelId(id);
}

export function showApp(host: HasAppShow): void {
  host.app.show.showApp();
}

const _subscriptions = new WeakMap<App, AppSubscriptions>();

function replaceAppSubscription(app: App, key: keyof AppSubscriptions, unsubscribe: () => void): void {
  const subscriptions = _subscriptions.get(app) ?? {};
  subscriptions[key]?.();
  subscriptions[key] = unsubscribe;
  _subscriptions.set(app, subscriptions);
}
