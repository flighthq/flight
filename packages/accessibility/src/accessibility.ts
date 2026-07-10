import type {
  AccessibilityBackend,
  AccessibilityLiveness,
  AccessibilityNode,
  AccessibilityState,
} from '@flighthq/types';

// Speaks a transient message through the platform's live region. `liveness` picks urgency: 'polite'
// waits for current speech, 'assertive' interrupts. Defaults to 'polite'. No-op when no backend can
// speak.
export function announceAccessibility(message: string, liveness: AccessibilityLiveness = 'polite'): void {
  getAccessibilityBackend().announce(message, liveness);
}

// Empties the mirrored accessibility tree, removing every published node. Announcement live regions
// are recreated lazily on the next announce.
export function clearAccessibilityTree(): void {
  getAccessibilityBackend().clear();
}

// Builds the default web backend: a visually-hidden ARIA DOM overlay. Created lazily by
// getAccessibilityBackend — nothing touches the DOM at import time, so importing the package has no
// side effect. Each published node becomes an element carrying `role` + `aria-*` attributes, nested
// under its `parentId`'s element (or the container root). By default a hidden container is appended
// to document.body on first use; pass `container` to host the overlay elsewhere. With no DOM present
// every method is a sentinel no-op (setFocus returns false) rather than throwing.
export function createWebAccessibilityBackend(container?: HTMLElement): AccessibilityBackend {
  const elements = new Map<string, HTMLElement>();
  const liveRegions = new Map<AccessibilityLiveness, HTMLElement>();
  let root: HTMLElement | null = container ?? null;
  let rootResolved = container !== undefined;

  // Resolves the overlay root, lazily creating and appending a hidden container on first use. Returns
  // null when no DOM is available, which flips every method into a no-op.
  function getRoot(): HTMLElement | null {
    if (rootResolved) return root;
    rootResolved = true;
    if (typeof document === 'undefined' || document.body === null) {
      root = null;
      return null;
    }
    root = _createHiddenAccessibilityContainer(document);
    document.body.appendChild(root);
    return root;
  }

  return {
    setNode(node) {
      const overlayRoot = getRoot();
      if (overlayRoot === null) return;
      let element = elements.get(node.id);
      if (element === undefined) {
        element = overlayRoot.ownerDocument.createElement('div');
        element.setAttribute('data-flight-accessibility-id', node.id);
        elements.set(node.id, element);
      }
      _applyAccessibilityElementAttributes(element, node);
      _reparentAccessibilityElement(element, node.parentId, elements, overlayRoot);
    },
    removeNode(id) {
      const element = elements.get(id);
      if (element === undefined) return;
      // Drop the node and its entire descendant subtree (Node.contains is true for the element
      // itself and every DOM descendant, matching the nested overlay layout).
      for (const [key, other] of elements) {
        if (element.contains(other)) elements.delete(key);
      }
      if (element.parentNode !== null) element.parentNode.removeChild(element);
    },
    clear() {
      const overlayRoot = getRoot();
      elements.clear();
      liveRegions.clear();
      if (overlayRoot !== null) overlayRoot.replaceChildren();
    },
    setFocus(id) {
      const overlayRoot = getRoot();
      if (overlayRoot === null) return false;
      const element = elements.get(id);
      if (element === undefined) return false;
      element.focus();
      return overlayRoot.ownerDocument.activeElement === element;
    },
    announce(message, liveness) {
      const overlayRoot = getRoot();
      if (overlayRoot === null) return;
      const region = _getAccessibilityLiveRegion(overlayRoot, liveRegions, liveness);
      region.textContent = message;
    },
  };
}

// The active accessibility backend, lazily defaulting to the web ARIA overlay. There is always a
// backend.
export function getAccessibilityBackend(): AccessibilityBackend {
  if (_backend === null) _backend = createWebAccessibilityBackend();
  return _backend;
}

// Removes a node and its entire descendant subtree from the mirrored tree.
export function removeAccessibilityNode(id: string): void {
  getAccessibilityBackend().removeNode(id);
}

// Installs a native host accessibility backend; pass null to fall back to a fresh lazy web default.
export function setAccessibilityBackend(backend: AccessibilityBackend | null): void {
  _backend = backend;
}

// Moves platform focus to the published node. Returns false when the node is missing or the platform
// could not focus it — a sentinel, never a throw.
export function setAccessibilityFocus(id: string): boolean {
  return getAccessibilityBackend().setFocus(id);
}

// Registers or updates a node in the mirrored tree, keyed by `node.id` and parented by
// `node.parentId`. Re-issuing with the same id updates the existing node in place.
export function setAccessibilityNode(node: Readonly<AccessibilityNode>): void {
  getAccessibilityBackend().setNode(node);
}

let _backend: AccessibilityBackend | null = null;

const _TEXT_NODE = 3;

// Reflects a node's semantics onto its overlay element: role, the label/description/value text and
// their ARIA attributes, focusability, and the mapped state attributes. Attributes are cleared when
// their source field is absent, so an update that drops a field clears the stale attribute.
function _applyAccessibilityElementAttributes(element: HTMLElement, node: Readonly<AccessibilityNode>): void {
  element.setAttribute('role', node.role);
  _reflectAccessibilityAttribute(element, 'aria-label', node.label);
  _reflectAccessibilityAttribute(element, 'aria-description', node.description);
  _reflectAccessibilityAttribute(element, 'title', node.description);
  _reflectAccessibilityAttribute(element, 'aria-valuetext', node.value);
  _setAccessibilityElementValueText(element, node.value);
  // Every node element is focusable so setFocus can move platform focus to it, including
  // non-interactive roles (heading/region) a caller may want to move a screen reader to.
  element.setAttribute('tabindex', '-1');
  _applyAccessibilityStateAttributes(element, node.states ?? _EMPTY_STATE);
}

// Maps each AccessibilityState field to its ARIA attribute. Absent fields clear the attribute so a
// state that was set then dropped does not linger.
function _applyAccessibilityStateAttributes(element: HTMLElement, state: Readonly<AccessibilityState>): void {
  _reflectAccessibilityBoolean(element, 'aria-disabled', state.disabled);
  _reflectAccessibilityBoolean(element, 'aria-checked', state.checked);
  _reflectAccessibilityBoolean(element, 'aria-expanded', state.expanded);
  _reflectAccessibilityBoolean(element, 'aria-selected', state.selected);
  _reflectAccessibilityBoolean(element, 'aria-pressed', state.pressed);
  _reflectAccessibilityBoolean(element, 'aria-busy', state.busy);
  _reflectAccessibilityBoolean(element, 'aria-hidden', state.hidden);
  _reflectAccessibilityBoolean(element, 'aria-readonly', state.readonly);
  _reflectAccessibilityBoolean(element, 'aria-required', state.required);
  _reflectAccessibilityNumber(element, 'aria-level', state.level);
  _reflectAccessibilityNumber(element, 'aria-valuemin', state.valueMin);
  _reflectAccessibilityNumber(element, 'aria-valuemax', state.valueMax);
  _reflectAccessibilityNumber(element, 'aria-valuenow', state.valueNow);
}

// Builds the visually-hidden overlay container. Uses the standard clip-rect "sr-only" inline styles
// so the elements stay in the accessibility tree while drawing nothing on screen.
function _createHiddenAccessibilityContainer(doc: Document): HTMLElement {
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

// Resolves the persistent aria-live region for the given urgency, creating and appending it under
// the container on first use (or when a prior clear removed it).
function _getAccessibilityLiveRegion(
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

// Sets a string attribute, or removes it when the value is absent.
function _reflectAccessibilityAttribute(element: HTMLElement, attribute: string, value: string | undefined): void {
  if (value === undefined) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, value);
}

// Sets a boolean attribute as 'true'/'false', or removes it when the value is absent.
function _reflectAccessibilityBoolean(element: HTMLElement, attribute: string, value: boolean | undefined): void {
  if (value === undefined) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, value ? 'true' : 'false');
}

// Sets a numeric attribute as its decimal string, or removes it when the value is absent.
function _reflectAccessibilityNumber(element: HTMLElement, attribute: string, value: number | undefined): void {
  if (value === undefined) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, String(value));
}

// Moves the element under the element of `parentId` (or the container root when the parent is unknown
// or unset). Only touches the DOM when the parent actually changes, so re-issuing an unchanged node
// causes no reparenting churn.
function _reparentAccessibilityElement(
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

// Maintains the node's value as a leading text node so nested child elements survive value updates
// (setting element.textContent would wipe the appended child nodes).
function _setAccessibilityElementValueText(element: HTMLElement, value: string | undefined): void {
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
