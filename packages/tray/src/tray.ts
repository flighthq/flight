import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  EntityConstruction,
  HasTrayLifecycle,
  HostTrayCapabilities,
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
  TrayIconForHost,
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
  TrayWithBalloon,
  TrayWithBalloonEvents,
  TrayWithBounds,
  TrayWithDoubleClickPolicy,
  TrayWithDropEvents,
  TrayWithImage,
  TrayWithInteractionEvents,
  TrayWithMenu,
  TrayWithMenuSelectionEvents,
  TrayWithPopupMenu,
  TrayWithPressedImage,
  TrayWithTemplateImage,
  TrayWithTitle,
  TrayWithTooltip,
  Vector2Like,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

interface TrayRuntime extends ReturnType<typeof createEntityRuntime> {
  animationGeneration: number;
  animationTimer: ReturnType<typeof setInterval> | null;
  animationWriteTail: Promise<void>;
  capabilities: Readonly<HostTrayCapabilities>;
  destroyPromise: Promise<TrayDestroyResult> | null;
  lifecycle: HasTrayLifecycle['tray']['lifecycle'];
  releases: Set<TrayReleaseRuntime>;
  state: 'active' | 'destroying' | 'partially-destroyed' | 'destroyed';
}

interface TrayReleaseRuntime extends TrayEventRelease {
  released: boolean;
}

export async function createTrayIcon<HostType extends HasTrayLifecycle>(
  host: HostType,
  options: Readonly<TrayIconOptions> = {},
): Promise<TrayCreateResult<TrayIconForHost<HostType>>> {
  const tray = finishEntity(allocateEntity<TrayIcon>()) as TrayIconForHost<HostType>;
  let result: TrayCreateProviderResult;
  try {
    result = await host.tray.lifecycle.create(tray, options);
  } catch (error) {
    const out = allocateEntity<Entity & { error?: unknown; outcome: 'tray-create-failed' }>();
    initializeTrayCreateFailedResult(out, error, 'tray-create-failed');
    return finishEntity(out);
  }
  if (result.outcome !== 'created') {
    const out = allocateEntity<TrayCreateResult<TrayIconForHost<HostType>>>();
    initializeTrayCreateProviderFailureResult(out, 'error' in result ? result.error : undefined, result.outcome);
    return finishEntity(out);
  }

  const runtime = createEntityRuntime() as TrayRuntime;
  runtime.animationGeneration = 0;
  runtime.animationTimer = null;
  runtime.animationWriteTail = Promise.resolve();
  runtime.capabilities = { ...host.tray };
  runtime.destroyPromise = null;
  runtime.lifecycle = host.tray.lifecycle;
  runtime.releases = new Set();
  runtime.state = 'active';
  tray[EntityRuntimeKey] = runtime;
  const out = allocateEntity<Entity & { outcome: 'created'; tray: TrayIconForHost<HostType> }>();
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
  tray: TrayWithBalloon,
  options: Readonly<TrayBalloonOptions>,
): Promise<TrayBalloonDisplayResult> {
  return invokeUpdate(tray, 'balloon', 'balloon-display-failed', (backend) => backend.display(tray, options));
}

export function getTrayIconBounds(tray: TrayWithBounds): Promise<TrayBoundsResult> {
  return invokeRead(tray, 'bounds', 'bounds-read-failed', (backend) => backend.get(tray));
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

export function getTrayIcons(host: HasTrayLifecycle): readonly TrayIcon[] {
  return host.tray.lifecycle.list();
}

export function getTrayIconTitle(tray: TrayWithTitle): Promise<TrayTitleReadResult> {
  return invokeRead(tray, 'title', 'title-read-failed', (backend) => backend.get(tray));
}

export function getTrayIconTooltip(tray: TrayWithTooltip): Promise<TrayTooltipReadResult> {
  return invokeRead(tray, 'tooltip', 'tooltip-read-failed', (backend) => backend.get(tray));
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
  return runtime === null || runtime.state !== 'active' || runtime.lifecycle.isDestroyed(tray);
}

export function isTrayIconAnimating(tray: Readonly<TrayIcon>): boolean {
  return getTrayRuntime(tray)?.animationTimer !== null;
}

export function onTrayBalloonEvent(
  tray: TrayWithBalloonEvents,
  listener: (event: Readonly<TrayBalloonEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(tray, 'balloonEvents', listener);
}

export function onTrayDrop(
  tray: TrayWithDropEvents,
  listener: (event: Readonly<TrayDropEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(tray, 'dropEvents', listener);
}

export function onTrayInteraction(
  tray: TrayWithInteractionEvents,
  listener: (event: Readonly<TrayInteractionEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(tray, 'interactionEvents', listener);
}

export function onTrayMenuSelection(
  tray: TrayWithMenuSelectionEvents,
  listener: (event: Readonly<TrayMenuSelectionEvent>) => void,
): TrayEventAttachResult {
  return attachTrayEvent(tray, 'menuSelectionEvents', listener);
}

export function popupTrayContextMenu(
  tray: TrayWithPopupMenu,
  position?: Readonly<Vector2Like>,
): Promise<TrayPopupMenuResult> {
  return invokeUpdate(tray, 'popupMenu', 'popup-failed', (backend) => backend.popup(tray, position));
}

export function removeTrayBalloon(tray: TrayWithBalloon): Promise<TrayBalloonRemoveResult> {
  return invokeUpdate(tray, 'balloon', 'balloon-remove-failed', (backend) => backend.remove(tray));
}

export function setTrayAnimationGuard(
  guard: ((tray: TrayIcon, frameCount: number, intervalMs: number) => void) | null,
): void {
  _animationGuard = guard;
}

export function setTrayIcon(tray: TrayWithImage, icon: TrayIconSource): Promise<TrayImageUpdateResult> {
  return invokeUpdate(tray, 'image', 'image-update-failed', (backend) => backend.set(tray, icon));
}

export function setTrayIconContextMenu(
  tray: TrayWithMenu,
  items: readonly MenuItemTemplate[],
): Promise<TrayMenuUpdateResult> {
  return invokeUpdate(tray, 'menu', 'menu-install-failed', (backend) => backend.set(tray, items));
}

export function setTrayIconTemplate(
  tray: TrayWithTemplateImage,
  isTemplate: boolean,
): Promise<TrayTemplateImageUpdateResult> {
  return invokeUpdate(tray, 'templateImage', 'template-image-update-failed', (backend) =>
    backend.set(tray, isTemplate),
  );
}

export function setTrayIconTitle(tray: TrayWithTitle, title: string): Promise<TrayTitleUpdateResult> {
  return invokeUpdate(tray, 'title', 'title-update-failed', (backend) => backend.set(tray, title));
}

export function setTrayIconTooltip(tray: TrayWithTooltip, tooltip: string): Promise<TrayTooltipUpdateResult> {
  return invokeUpdate(tray, 'tooltip', 'tooltip-update-failed', (backend) => backend.set(tray, tooltip));
}

type EventSlot = 'balloonEvents' | 'dropEvents' | 'interactionEvents' | 'menuSelectionEvents';
interface EventBackend<Event extends object> {
  getSignal(tray: TrayIcon): Signal<(event: Readonly<Event>) => void> | null;
}

function attachTrayEvent<Event extends object, Slot extends EventSlot>(
  tray: TrayIcon,
  slot: Slot,
  listener: (event: Readonly<Event>) => void,
): TrayEventAttachResult {
  const runtime = getActiveTrayRuntime(tray);
  if (runtime === null) return { outcome: 'tray-destroyed' };
  try {
    const backend = runtime.capabilities[slot] as EventBackend<Event> | undefined;
    const signal = backend?.getSignal(tray) ?? null;
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
  tray: TrayWithDoubleClickPolicy,
  ignore: boolean,
): Promise<TrayDoubleClickPolicyUpdateResult> {
  return invokeUpdate(tray, 'doubleClickPolicy', 'double-click-policy-update-failed', (backend) =>
    backend.setIgnore(tray, ignore),
  );
}

export function setTrayPressedIcon(
  tray: TrayWithPressedImage,
  icon: TrayIconSource,
): Promise<TrayPressedImageUpdateResult> {
  return invokeUpdate(tray, 'pressedImage', 'pressed-image-update-failed', (backend) => backend.set(tray, icon));
}

export async function startTrayIconAnimation(
  tray: TrayWithImage,
  frames: readonly TrayIconSource[],
  intervalMs: number,
): Promise<TrayAnimationStartResult> {
  if (frames.length === 0) return { outcome: 'empty' };
  const runtime = getActiveTrayRuntime(tray);
  if (runtime === null) return { outcome: 'tray-destroyed' };
  _animationGuard?.(tray, frames.length, intervalMs);
  stopTrayAnimationRuntime(runtime);
  const generation = runtime.animationGeneration;
  const first = await queueAnimationWrite(tray, runtime, generation, frames[0]!);
  if (first.outcome !== 'updated') return first;
  if (runtime.state !== 'active' || runtime.animationGeneration !== generation) return { outcome: 'tray-destroyed' };
  let index = 0;
  runtime.animationTimer = setInterval(() => {
    index = (index + 1) % frames.length;
    void queueAnimationWrite(tray, runtime, generation, frames[index]!);
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
  tray: TrayWithImage,
  runtime: TrayRuntime,
  generation: number,
  frame: TrayIconSource,
): Promise<TrayImageUpdateResult> {
  let result: TrayImageUpdateResult = { outcome: 'tray-destroyed' };
  runtime.animationWriteTail = runtime.animationWriteTail.then(async () => {
    if (runtime.state !== 'active' || runtime.animationGeneration !== generation) return;
    result = await setTrayIcon(tray, frame);
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

async function invokeUpdate<
  Slot extends keyof HostTrayCapabilities,
  Backend extends NonNullable<HostTrayCapabilities[Slot]>,
  Result extends { readonly outcome: string },
>(
  tray: TrayIcon,
  slot: Slot,
  failure: Result['outcome'],
  operation: (backend: Backend) => Promise<Result>,
): Promise<Result> {
  const runtime = getActiveTrayRuntime(tray);
  if (runtime === null) return { outcome: 'tray-destroyed' } as Result;
  try {
    return await operation(runtime.capabilities[slot] as Backend);
  } catch (error) {
    return { error, outcome: failure } as unknown as Result;
  }
}

function invokeRead<
  Slot extends keyof HostTrayCapabilities,
  Backend extends NonNullable<HostTrayCapabilities[Slot]>,
  Result extends { readonly outcome: string },
>(
  tray: TrayIcon,
  slot: Slot,
  failure: Result['outcome'],
  operation: (backend: Backend) => Promise<Result>,
): Promise<Result> {
  return invokeUpdate(tray, slot, failure, operation);
}
