import type {
  AccessibilityBackend,
  AccessibilityLiveness,
  AccessibilityNode,
  AccessibilityOperation,
  AccessibilityState,
  BackendOperationExplanation,
} from '@flighthq/types/contract';
import type { BackendExplanation } from '@flighthq/types/contract';

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
  // ★ Ownership is decided HERE, at construction, not guessed at teardown: a container handed in belongs
  // to the caller and must survive destroy; one this backend lazily created belongs to it and must not.
  const ownsRoot = container === undefined;

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
    // Frees everything this instance owns. Idempotent: the maps are emptied and the root reference
    // dropped, so a second destroy finds nothing to free.
    destroy() {
      elements.clear();
      liveRegions.clear();
      // Remove the container when this backend created it; when it was handed one, empty the elements this
      // backend put inside it but leave the container itself — the caller owns that and may reuse it.
      if (ownsRoot) root?.remove();
      else root?.replaceChildren();
      root = null;
      // Left resolved so a destroyed backend cannot lazily resurrect a fresh container on the next call.
      rootResolved = true;
    },
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

// Frees what the installed backend owns and clears the slot. Safe with nothing installed and safe to call
// twice — the second call finds an empty slot, which is what makes teardown exactly-once without a
// destroyed flag that could drift from the thing it describes.
export function destroyAccessibilityBackend(): void {
  const previous = [_custom, _host] as const;
  _custom = null;
  _host = null;
  releaseAccessibilityBackends(previous);
}

export function explainAccessibilityBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// Which layer implements `operation`, and whether anything real does. The sentinel is never consulted: it
// answers every operation, so counting it would report `true` for everything and say nothing.
export function explainAccessibilityOperation(operation: AccessibilityOperation): BackendOperationExplanation {
  if (_custom !== null && typeof _custom[operation] === 'function') {
    return { implemented: true, layer: 'custom', operation };
  }
  if (_host !== null && typeof _host[operation] === 'function') {
    return { implemented: true, layer: 'host', operation };
  }
  return { implemented: false, layer: 'sentinel', operation };
}

// The active accessibility backend. Precedence: custom > host > sentinel.
export function getAccessibilityBackend(): AccessibilityBackend {
  return _custom ?? _host ?? _sentinel;
}

// Whether a real backend implements `operation`, as opposed to the sentinel answering for it.
export function hasAccessibilityOperation(operation: AccessibilityOperation): boolean {
  return explainAccessibilityOperation(operation).implemented;
}

export function installAccessibilityHostBackend(backend: AccessibilityBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeAccessibilityHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Removes a node and its entire descendant subtree from the mirrored tree.
export function removeAccessibilityNode(id: string): void {
  getAccessibilityBackend().removeNode(id);
}

export function resetAccessibilityBackendForTest(): void {
  destroyAccessibilityBackend();
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Installs a custom accessibility backend; pass null to revert to precedence fallback.
// Installs the backend, DESTROYING the outgoing one first so replacement cannot orphan the hidden overlay
// container it appended to the document, nor the element maps it held. Installing the backend already
// present is a no-op rather than a destroy-then-reinstall of live DOM.
export function setAccessibilityBackend(backend: AccessibilityBackend | null): void {
  if (_custom === backend) return;
  const previous = [_custom] as const;
  _custom = backend;
  releaseAccessibilityBackends(previous);
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

let _custom: AccessibilityBackend | null = null;
let _host: AccessibilityBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: AccessibilityBackend = {
  setNode() {},
  removeNode() {},
  clear() {},
  setFocus() {
    return false;
  },
  announce() {},
};

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

// Destroys every backend that WAS referenced and is not referenced any more — exactly once each.
//
// ★ Ownership is per SLOT, and the same object may sit in two slots. Three cases this gets right that a
// `_custom ?? _host` teardown gets wrong:
//   - SHADOWED: installing a custom over a live host does not destroy the host; it is still owned.
//   - ALIASED: when custom and host are the same object, clearing custom must NOT destroy it, because the
//     host slot still references it.
//   - DISTINCT: clearing both must destroy BOTH, not just whichever the `??` chain reached first.
// Deduplicated by identity, so an aliased backend is destroyed once and never twice.
function releaseAccessibilityBackends(previous: readonly (Readonly<AccessibilityBackend> | null)[]): void {
  const retained = new Set<unknown>([_custom, _host].filter((slot) => slot !== null));
  const released = new Set<unknown>();
  for (const backend of previous) {
    if (backend === null || retained.has(backend) || released.has(backend)) continue;
    released.add(backend);
    backend.destroy?.();
  }
}
