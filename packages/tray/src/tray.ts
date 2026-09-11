import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  EntityConstruction,
  HostTrayBalloonEventsProvider,
  HostTrayBalloonProvider,
  HostTrayBoundsProvider,
  HostTrayDoubleClickPolicyProvider,
  HostTrayDropEventsProvider,
  HostTrayImageProvider,
  HostTrayInteractionEventsProvider,
  HostTrayLifecycleProvider,
  HostTrayMenuProvider,
  HostTrayMenuSelectionEventsProvider,
  HostTrayPopupMenuProvider,
  HostTrayPressedImageProvider,
  HostTrayTemplateImageProvider,
  HostTrayTitleProvider,
  HostTrayTooltipProvider,
  MenuItemTemplate,
  Signal,
  TrayAnimationStartResult,
  TrayAnimationStopResult,
  TrayBalloonDisplayResult,
  TrayBalloonEvent,
  TrayBalloonOptions,
  TrayBalloonRemoveResult,
  TrayBoundsResult,
  TrayCreateResult,
  TrayCreateProviderResult,
  TrayDestroyResult,
  TrayDoubleClickPolicyUpdateResult,
  TrayDropEvent,
  TrayEventAttachResult,
  TrayEventRelease,
  TrayIcon,
  TrayIconOptions,
  TrayIconSource,
  TrayImageUpdateResult,
  TrayInteractionEvent,
  TrayMenuSelectionEvent,
  TrayMenuUpdateResult,
  TrayPopupMenuResult,
  TrayPressedImageUpdateResult,
  TrayReleaseResult,
  TrayTemplateImageUpdateResult,
  TrayTitleReadResult,
  TrayTitleUpdateResult,
  TrayTooltipReadResult,
  TrayTooltipUpdateResult,
  Vector2Like,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

interface TrayRuntime extends ReturnType<typeof createEntityRuntime> {
  animationGeneration: number;
  animationTimer: ReturnType<typeof setInterval> | null;
  animationWriteTail: Promise<void>;
  destroyPromise: Promise<TrayDestroyResult> | null;
  lifecycle: Readonly<HostTrayLifecycleProvider>;
  releases: Set<TrayReleaseRuntime>;
  state: 'active' | 'destroying' | 'partially-destroyed' | 'destroyed';
}

interface TrayReleaseRuntime extends TrayEventRelease {
  released: boolean;
}

export async function createTrayIcon(
  hostTrayLifecycle: Readonly<HostTrayLifecycleProvider>,
  options: Readonly<TrayIconOptions> = {},
): Promise<TrayCreateResult> {
  const tray = finishEntity(allocateEntity<TrayIcon>());
  let result: TrayCreateProviderResult;
  try {
    result = await hostTrayLifecycle.create(tray, options);
  } catch (error) {
    const out = allocateEntity<Entity & { error?: unknown; outcome: 'tray-create-failed' }>();
    initializeTrayCreateFailedResult(out, error, 'tray-create-failed');
    return finishEntity(out);
  }
  if (result.outcome !== 'created') {
    const out = allocateEntity<TrayCreateResult>();
    initializeTrayCreateProviderFailureResult(out, 'error' in result ? result.error : undefined, result.outcome);
    return finishEntity(out);
  }

  const runtime = createEntityRuntime() as TrayRuntime;
  runtime.animationGeneration = 0;
  runtime.animationTimer = null;
  runtime.animationWriteTail = Promise.resolve();
  runtime.destroyPromise = null;
  runtime.lifecycle = hostTrayLifecycle;
  runtime.releases = new Set();
  runtime.state = 'active';
  tray[EntityRuntimeKey] = runtime;
  const out = allocateEntity<Entity & { outcome: 'created'; tray: TrayIcon }>();
  initializeTrayCreateSuccessResult(out, 'created', tray);
  return finishEntity(out);
}

export function destroyTrayIcon(tray: TrayIcon): Promise<TrayDestroyResult> {
  const runtime = getTrayRuntime(tray);
  if (runtime === null || runtime.state === 'destroyed') return Promise.resolve({ outcome: 'already-destroyed' });
  if (runtime.destroyPromise !== null) return runtime.destroyPromise;
  runtime.destroyPromise = destroyTrayRuntime(tray, runtime).finally(() => {
    runtime.destroyPromise = null;
  });
  return runtime.destroyPromise;
}

export function displayTrayBalloon(
  hostTrayBalloon: Readonly<HostTrayBalloonProvider>,
  tray: TrayIcon,
  options: Readonly<TrayBalloonOptions>,
): Promise<TrayBalloonDisplayResult> {
  return invokeUpdate(hostTrayBalloon, tray, 'balloon-display-failed', (provider) => provider.display(tray, options));
}

export function getTrayIconBounds(
  hostTrayBounds: Readonly<HostTrayBoundsProvider>,
  tray: TrayIcon,
): Promise<TrayBoundsResult> {
  return invokeRead(hostTrayBounds, tray, 'bounds-read-failed', (provider) => provider.get(tray));
}

async function destroyTrayRuntime(tray: TrayIcon, runtime: TrayRuntime): Promise<TrayDestroyResult> {
  runtime.state = 'destroying';
  stopTrayAnimationRuntime(runtime);
  for (const release of [...runtime.releases]) await release.release();
  let result;
  try {
    result = await runtime.lifecycle.destroy(tray);
  } catch (error) {
    result = { failures: [{ error, step: 'native-resource' as const }], outcome: 'tray-destroy-failed' as const };
  }
  if (result.outcome === 'destroyed') {
    runtime.state = 'destroyed';
    return result;
  }
  runtime.state = 'partially-destroyed';
  return result;
}

export function getTrayIcons(hostTrayLifecycle: Readonly<HostTrayLifecycleProvider>): readonly TrayIcon[] {
  return hostTrayLifecycle.list();
}

export function getTrayIconTitle(
  hostTrayTitle: Readonly<HostTrayTitleProvider>,
  tray: TrayIcon,
): Promise<TrayTitleReadResult> {
  return invokeRead(hostTrayTitle, tray, 'title-read-failed', (provider) => provider.get(tray));
}

export function getTrayIconTooltip(
  hostTrayTooltip: Readonly<HostTrayTooltipProvider>,
  tray: TrayIcon,
): Promise<TrayTooltipReadResult> {
  return invokeRead(hostTrayTooltip, tray, 'tooltip-read-failed', (provider) => provider.get(tray));
}

export function initializeTrayCreateFailedResult(
  out: EntityConstruction<Entity & { error?: unknown; outcome: 'tray-create-failed' }>,
  error: unknown,
  outcome: 'tray-create-failed',
): void {
  out.error = error;
  out.outcome = outcome;
}

export function initializeTrayCreateProviderFailureResult(
  out: EntityConstruction<Entity & { error?: unknown; outcome: string }>,
  error: unknown,
  outcome: Exclude<TrayCreateProviderResult, { readonly outcome: 'created' }>['outcome'],
): void {
  out.error = error;
  out.outcome = outcome;
}

export function initializeTrayCreateSuccessResult<Tray extends TrayIcon>(
  out: EntityConstruction<Entity & { outcome: 'created'; tray: Tray }>,
  outcome: 'created',
  tray: Tray,
): void {
  out.outcome = outcome;
  out.tray = tray;
}

export function isTrayDestroyed(tray: Readonly<TrayIcon>): boolean {
  const runtime = getTrayRuntime(tray);
  return runtime !== null && (runtime.state !== 'active' || runtime.lifecycle.isDestroyed(tray));
}

export function isTrayIconAnimating(tray: Readonly<TrayIcon>): boolean {
  return getTrayRuntime(tray)?.animationTimer !== null;
}

export function onTrayBalloonEvent(
  hostTrayBalloonEvents: Readonly<HostTrayBalloonEventsProvider>,
  tray: TrayIcon,
  listener: (event: Readonly<TrayBalloonEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(hostTrayBalloonEvents, tray, listener);
}

export function onTrayDrop(
  hostTrayDropEvents: Readonly<HostTrayDropEventsProvider>,
  tray: TrayIcon,
  listener: (event: Readonly<TrayDropEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(hostTrayDropEvents, tray, listener);
}

export function onTrayInteraction(
  hostTrayInteractionEvents: Readonly<HostTrayInteractionEventsProvider>,
  tray: TrayIcon,
  listener: (event: Readonly<TrayInteractionEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(hostTrayInteractionEvents, tray, listener);
}

export function onTrayMenuSelection(
  hostTrayMenuSelectionEvents: Readonly<HostTrayMenuSelectionEventsProvider>,
  tray: TrayIcon,
  listener: (event: Readonly<TrayMenuSelectionEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(hostTrayMenuSelectionEvents, tray, listener);
}

export function popupTrayContextMenu(
  hostTrayPopupMenu: Readonly<HostTrayPopupMenuProvider>,
  tray: TrayIcon,
  position?: Readonly<Vector2Like>,
): Promise<TrayPopupMenuResult> {
  return invokeUpdate(hostTrayPopupMenu, tray, 'popup-failed', (provider) => provider.popup(tray, position));
}

export function removeTrayBalloon(
  hostTrayBalloon: Readonly<HostTrayBalloonProvider>,
  tray: TrayIcon,
): Promise<TrayBalloonRemoveResult> {
  return invokeUpdate(hostTrayBalloon, tray, 'balloon-remove-failed', (provider) => provider.remove(tray));
}

export function setTrayAnimationGuard(
  guard: ((tray: TrayIcon, frameCount: number, intervalMs: number) => void) | null,
): void {
  _animationGuard = guard;
}

export function setTrayIcon(
  hostTrayImage: Readonly<HostTrayImageProvider>,
  tray: TrayIcon,
  icon: TrayIconSource,
): Promise<TrayImageUpdateResult> {
  return invokeUpdate(hostTrayImage, tray, 'image-update-failed', (provider) => provider.set(tray, icon));
}

export function setTrayIconContextMenu(
  hostTrayMenu: Readonly<HostTrayMenuProvider>,
  tray: TrayIcon,
  items: readonly MenuItemTemplate[],
): Promise<TrayMenuUpdateResult> {
  return invokeUpdate(hostTrayMenu, tray, 'menu-install-failed', (provider) => provider.set(tray, items));
}

export function setTrayIconTemplate(
  hostTrayTemplateImage: Readonly<HostTrayTemplateImageProvider>,
  tray: TrayIcon,
  isTemplate: boolean,
): Promise<TrayTemplateImageUpdateResult> {
  return invokeUpdate(hostTrayTemplateImage, tray, 'template-image-update-failed', (provider) =>
    provider.set(tray, isTemplate),
  );
}

export function setTrayIconTitle(
  hostTrayTitle: Readonly<HostTrayTitleProvider>,
  tray: TrayIcon,
  title: string,
): Promise<TrayTitleUpdateResult> {
  return invokeUpdate(hostTrayTitle, tray, 'title-update-failed', (provider) => provider.set(tray, title));
}

export function setTrayIconTooltip(
  hostTrayTooltip: Readonly<HostTrayTooltipProvider>,
  tray: TrayIcon,
  tooltip: string,
): Promise<TrayTooltipUpdateResult> {
  return invokeUpdate(hostTrayTooltip, tray, 'tooltip-update-failed', (provider) => provider.set(tray, tooltip));
}

interface EventProvider<Event extends object> {
  getSignal(tray: TrayIcon): Signal<(event: Readonly<Event>) => void> | null;
}

function attachTrayEvent<Event extends object>(
  provider: Readonly<EventProvider<Event>>,
  tray: TrayIcon,
  listener: (event: Readonly<Event>) => void,
): TrayEventAttachResult {
  const runtime = getActiveTrayRuntime(tray);
  if (runtime === null) return { outcome: 'tray-destroyed' };
  try {
    const signal = provider.getSignal(tray);
    if (signal === null) return { outcome: 'tray-destroyed' };
    connectSignal(signal, listener);
    const release: TrayReleaseRuntime = {
      released: false,
      async release(): Promise<TrayReleaseResult> {
        if (release.released) return { outcome: 'already-released' };
        try {
          disconnectSignal(signal, listener);
          release.released = true;
          runtime.releases.delete(release);
          return { outcome: 'released' };
        } catch (error) {
          return { error, outcome: 'release-failed' };
        }
      },
    };
    runtime.releases.add(release);
    return { outcome: 'attached', release };
  } catch (error) {
    return { error, outcome: 'subscription-failed' };
  }
}

export function setTrayIgnoreDoubleClickEvents(
  hostTrayDoubleClickPolicy: Readonly<HostTrayDoubleClickPolicyProvider>,
  tray: TrayIcon,
  ignore: boolean,
): Promise<TrayDoubleClickPolicyUpdateResult> {
  return invokeUpdate(hostTrayDoubleClickPolicy, tray, 'double-click-policy-update-failed', (provider) =>
    provider.setIgnore(tray, ignore),
  );
}

export function setTrayPressedIcon(
  hostTrayPressedImage: Readonly<HostTrayPressedImageProvider>,
  tray: TrayIcon,
  icon: TrayIconSource,
): Promise<TrayPressedImageUpdateResult> {
  return invokeUpdate(hostTrayPressedImage, tray, 'pressed-image-update-failed', (provider) =>
    provider.set(tray, icon),
  );
}

export async function startTrayIconAnimation(
  hostTrayImage: Readonly<HostTrayImageProvider>,
  tray: TrayIcon,
  frames: readonly TrayIconSource[],
  intervalMs: number,
): Promise<TrayAnimationStartResult> {
  if (frames.length === 0) return { outcome: 'empty' };
  const runtime = getActiveTrayRuntime(tray);
  if (runtime === null) return { outcome: 'tray-destroyed' };
  _animationGuard?.(tray, frames.length, intervalMs);
  stopTrayAnimationRuntime(runtime);
  const generation = runtime.animationGeneration;
  const first = await queueAnimationWrite(hostTrayImage, tray, runtime, generation, frames[0]!);
  if (first.outcome !== 'updated') return first;
  if (runtime.state !== 'active' || runtime.animationGeneration !== generation) return { outcome: 'tray-destroyed' };
  let index = 0;
  runtime.animationTimer = setInterval(() => {
    index = (index + 1) % frames.length;
    void queueAnimationWrite(hostTrayImage, tray, runtime, generation, frames[index]!);
  }, intervalMs);
  const release: TrayReleaseRuntime = {
    released: false,
    async release(): Promise<TrayReleaseResult> {
      if (release.released) return { outcome: 'already-released' };
      release.released = true;
      if (runtime.animationGeneration === generation) stopTrayAnimationRuntime(runtime);
      return { outcome: 'released' };
    },
  };
  return { outcome: 'started', release };
}

async function queueAnimationWrite(
  hostTrayImage: Readonly<HostTrayImageProvider>,
  tray: TrayIcon,
  runtime: TrayRuntime,
  generation: number,
  frame: TrayIconSource,
): Promise<TrayImageUpdateResult> {
  let result: TrayImageUpdateResult = { outcome: 'tray-destroyed' };
  runtime.animationWriteTail = runtime.animationWriteTail.then(async () => {
    if (runtime.state !== 'active' || runtime.animationGeneration !== generation) return;
    result = await setTrayIcon(hostTrayImage, tray, frame);
  });
  await runtime.animationWriteTail;
  return result;
}

function stopTrayAnimationRuntime(runtime: TrayRuntime): void {
  runtime.animationGeneration++;
  if (runtime.animationTimer !== null) clearInterval(runtime.animationTimer);
  runtime.animationTimer = null;
}

export function stopTrayIconAnimation(tray: TrayIcon): TrayAnimationStopResult {
  const runtime = getTrayRuntime(tray);
  if (runtime === null || runtime.animationTimer === null) return { outcome: 'already-stopped' };
  stopTrayAnimationRuntime(runtime);
  return { outcome: 'stopped' };
}

let _animationGuard: ((tray: TrayIcon, frameCount: number, intervalMs: number) => void) | null = null;

function getTrayRuntime(tray: Readonly<TrayIcon>): TrayRuntime | null {
  return (tray[EntityRuntimeKey] as TrayRuntime | undefined) ?? null;
}

function getActiveTrayRuntime(tray: Readonly<TrayIcon>): TrayRuntime | null {
  const runtime = getTrayRuntime(tray);
  return runtime?.state === 'active' ? runtime : null;
}

async function invokeUpdate<Provider, Result extends { readonly outcome: string }>(
  provider: Readonly<Provider>,
  tray: TrayIcon,
  failure: Result['outcome'],
  operation: (provider: Readonly<Provider>) => Promise<Result>,
): Promise<Result> {
  const runtime = getActiveTrayRuntime(tray);
  if (runtime === null) return { outcome: 'tray-destroyed' } as Result;
  try {
    return await operation(provider);
  } catch (error) {
    return { error, outcome: failure } as unknown as Result;
  }
}

function invokeRead<Provider, Result extends { readonly outcome: string }>(
  provider: Readonly<Provider>,
  tray: TrayIcon,
  failure: Result['outcome'],
  operation: (provider: Readonly<Provider>) => Promise<Result>,
): Promise<Result> {
  return invokeUpdate(provider, tray, failure, operation);
}
