import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AccessibilityBackend,
  AccessibilityLiveness,
  AccessibilityNode,
  AccessibilityState,
  EntityConstruction,
} from '@flighthq/types/contract';

export function createWebAccessibilityBackend(container?: HTMLElement): AccessibilityBackend {
  const out = allocateEntity<AccessibilityBackend>();
  initializeWebAccessibilityBackend(out, container);
  return finishEntity(out);
}

// Builds a visually-hidden ARIA DOM provider. Construction is passive: the default root is created on
// the first operation, so this factory and webHost are safe to import where no document exists.
export function initializeWebAccessibilityBackend(
  out: EntityConstruction<AccessibilityBackend>,
  container?: HTMLElement,
): void {
  const elements = new Map<string, HTMLElement>();
  const liveRegions = new Map<AccessibilityLiveness, HTMLElement>();
  let destroyed = false;
  let root: HTMLElement | null = container ?? null;
  let rootResolved = container !== undefined;
  // A supplied container remains caller-owned; a lazily created root belongs to this provider.
  const ownsRoot = container === undefined;
  function getRoot(): HTMLElement | null {
    if (rootResolved) return root;
    rootResolved = true;
    if (typeof document === 'undefined' || document.body === null) {
      root = null;
      return null;
    }
    root = createHiddenAccessibilityContainer(document);
    document.body.appendChild(root);
    return root;
  }
  function unavailableRootReason(): 'destroyed' | 'no-dom' | null {
    if (destroyed) return 'destroyed';
    return getRoot() === null ? 'no-dom' : null;
  }
  // Removes only identities this provider created. Borrowed roots may contain unrelated children,
  // including lookalikes with Flight data attributes, and therefore cannot be cleared root-wide.
  function removeOwnedAccessibilityDom(): void {
    for (const element of elements.values()) element.remove();
    for (const region of liveRegions.values()) region.remove();
    elements.clear();
    liveRegions.clear();
  }
  out.announce = (message, liveness) => {
    const unavailable = unavailableRootReason();
    if (unavailable !== null) return { reason: unavailable };
    const overlayRoot = root as HTMLElement;
    const region = getAccessibilityLiveRegion(overlayRoot, liveRegions, liveness);
    region.textContent = message;
    return _OK;
  };
  out.clear = () => {
    const unavailable = unavailableRootReason();
    if (unavailable !== null) return { reason: unavailable };
    removeOwnedAccessibilityDom();
    return _OK;
  };
  out.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    removeOwnedAccessibilityDom();
    if (ownsRoot) root?.remove();
    root = null;
    // A destroyed provider is terminal and cannot resurrect a new root on a later command.
    rootResolved = true;
  };
  out.removeNode = (id) => {
    const unavailable = unavailableRootReason();
    if (unavailable !== null) return { reason: unavailable };
    const element = elements.get(id);
    if (element === undefined) return _NODE_NOT_FOUND;
    // Node.contains includes the node itself and every DOM descendant, matching overlay nesting.
    for (const [key, other] of elements) {
      if (element.contains(other)) elements.delete(key);
    }
    element.remove();
    return _OK;
  };
  out.setFocus = (id) => {
    const unavailable = unavailableRootReason();
    if (unavailable !== null) return { reason: unavailable };
    const element = elements.get(id);
    if (element === undefined) return _NODE_NOT_FOUND;
    element.focus();
    return element.ownerDocument.activeElement === element ? _OK : _FOCUS_NOT_MOVED;
  };
  out.setNode = (node) => {
    const unavailable = unavailableRootReason();
    if (unavailable !== null) return { reason: unavailable };
    const overlayRoot = root as HTMLElement;
    let element = elements.get(node.id);
    if (element === undefined) {
      element = overlayRoot.ownerDocument.createElement('div');
      element.setAttribute('data-flight-accessibility-id', node.id);
      elements.set(node.id, element);
    }
    applyAccessibilityElementAttributes(element, node);
    reparentAccessibilityElement(element, node.parentId, elements, overlayRoot);
    return _OK;
  };
}

// The stable provider composed into webHost. It remains passive until a command first needs its root.
export const webAccessibilityBackend = createWebAccessibilityBackend();

function applyAccessibilityElementAttributes(element: HTMLElement, node: Readonly<AccessibilityNode>): void {
  element.setAttribute('role', node.role);
  reflectAccessibilityAttribute(element, 'aria-label', node.label);
  reflectAccessibilityAttribute(element, 'aria-description', node.description);
  reflectAccessibilityAttribute(element, 'title', node.description);
  reflectAccessibilityAttribute(element, 'aria-valuetext', node.value);
  setAccessibilityElementValueText(element, node.value);
  element.setAttribute('tabindex', '-1');
  applyAccessibilityStateAttributes(element, node.states ?? _EMPTY_STATE);
}

function applyAccessibilityStateAttributes(element: HTMLElement, state: Readonly<AccessibilityState>): void {
  reflectAccessibilityBoolean(element, 'aria-disabled', state.disabled);
  reflectAccessibilityBoolean(element, 'aria-checked', state.checked);
  reflectAccessibilityBoolean(element, 'aria-expanded', state.expanded);
  reflectAccessibilityBoolean(element, 'aria-selected', state.selected);
  reflectAccessibilityBoolean(element, 'aria-pressed', state.pressed);
  reflectAccessibilityBoolean(element, 'aria-busy', state.busy);
  reflectAccessibilityBoolean(element, 'aria-hidden', state.hidden);
  reflectAccessibilityBoolean(element, 'aria-readonly', state.readonly);
  reflectAccessibilityBoolean(element, 'aria-required', state.required);
  reflectAccessibilityNumber(element, 'aria-level', state.level);
  reflectAccessibilityNumber(element, 'aria-valuemin', state.valueMin);
  reflectAccessibilityNumber(element, 'aria-valuemax', state.valueMax);
  reflectAccessibilityNumber(element, 'aria-valuenow', state.valueNow);
}

function createHiddenAccessibilityContainer(doc: Document): HTMLElement {
  const container = doc.createElement('div');
  container.setAttribute('data-flight-accessibility', 'true');
  const style = container.style;
  style.position = 'absolute';
  style.width = '1px';
  style.height = '1px';
  style.margin = '-1px';
  style.padding = '0';
  style.border = '0';
  style.overflow = 'hidden';
  style.clip = 'rect(0 0 0 0)';
  style.clipPath = 'inset(50%)';
  style.whiteSpace = 'nowrap';
  return container;
}

function getAccessibilityLiveRegion(
  root: HTMLElement,
  liveRegions: Map<AccessibilityLiveness, HTMLElement>,
  liveness: AccessibilityLiveness,
): HTMLElement {
  let region = liveRegions.get(liveness);
  if (region === undefined || region.parentNode === null) {
    region = root.ownerDocument.createElement('div');
    region.setAttribute('aria-live', liveness);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('data-flight-accessibility-live', liveness);
    liveRegions.set(liveness, region);
    root.appendChild(region);
  }
  return region;
}

function reflectAccessibilityAttribute(element: HTMLElement, attribute: string, value: string | undefined): void {
  if (value === undefined) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, value);
}

function reflectAccessibilityBoolean(element: HTMLElement, attribute: string, value: boolean | undefined): void {
  if (value === undefined) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, value ? 'true' : 'false');
}

function reflectAccessibilityNumber(element: HTMLElement, attribute: string, value: number | undefined): void {
  if (value === undefined) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, String(value));
}

function reparentAccessibilityElement(
  element: HTMLElement,
  parentId: string | undefined,
  elements: ReadonlyMap<string, HTMLElement>,
  root: HTMLElement,
): void {
  let parent: HTMLElement = root;
  if (parentId !== undefined) {
    const found = elements.get(parentId);
    if (found !== undefined) parent = found;
  }
  if (element.parentNode !== parent) parent.appendChild(element);
}

function setAccessibilityElementValueText(element: HTMLElement, value: string | undefined): void {
  const first = element.firstChild;
  if (value === undefined) {
    if (first !== null && first.nodeType === _TEXT_NODE) element.removeChild(first);
    return;
  }
  if (first !== null && first.nodeType === _TEXT_NODE) {
    first.nodeValue = value;
    return;
  }
  element.insertBefore(element.ownerDocument.createTextNode(value), first);
}

const _EMPTY_STATE: Readonly<AccessibilityState> = {};
const _FOCUS_NOT_MOVED = { reason: 'focus-not-moved' } as const;
const _NODE_NOT_FOUND = { reason: 'node-not-found' } as const;
const _OK = { reason: 'ok' } as const;
const _TEXT_NODE = 3;
