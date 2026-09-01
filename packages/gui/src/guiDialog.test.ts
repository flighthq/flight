import { createFocusManager, getFocusedNode, setFocusedNode, setNodeFocusable } from '@flighthq/interaction/contract';
import { getNodeParent } from '@flighthq/node/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { GuiDialogCloseResult } from '@flighthq/types/contract';

import {
  closeGuiDialog,
  createGuiDialog,
  disposeGuiDialog,
  enqueueGuiDialog,
  getActiveGuiDialogEntry,
  getGuiDialogEntries,
  getGuiDialogSignals,
  removeGuiDialogEntry,
} from './guiDialog';
import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';

describe('closeGuiDialog', () => {
  it('closes the active entry and promotes the FIFO head without reparenting caller visuals', () => {
    const backdrop = createGuiTestNode();
    const firstRoot = createGuiTestNode();
    const secondRoot = createGuiTestNode();
    const dialog = createGuiDialog({ backdrop });
    const closed: GuiDialogCloseResult[] = [];
    connectSignal(getGuiDialogSignals(dialog).onClose, (result) => closed.push(result));

    enqueueGuiDialog(dialog, { id: 'first', root: firstRoot });
    enqueueGuiDialog(dialog, { id: 'second', root: secondRoot });

    expect([backdrop.visible, firstRoot.visible, secondRoot.visible]).toEqual([true, true, false]);
    expect([getNodeParent(firstRoot), getNodeParent(secondRoot)]).toEqual([null, null]);

    expect(closeGuiDialog(dialog, { entryId: 'first', reason: 'accepted', value: 7 })).toBe(true);
    expect(getActiveGuiDialogEntry(dialog)?.id).toBe('second');
    expect([backdrop.visible, firstRoot.visible, secondRoot.visible]).toEqual([true, false, true]);
    expect(closed).toEqual([{ entryId: 'first', reason: 'accepted', value: 7 }]);
    expect([getNodeParent(firstRoot), getNodeParent(secondRoot)]).toEqual([null, null]);
  });

  it('rejects a mismatched result and a reentrant duplicate close', () => {
    const root = createGuiTestNode();
    const dialog = createGuiDialog();
    enqueueGuiDialog(dialog, { id: 'only', root });
    const result: GuiDialogCloseResult = { entryId: 'only', reason: 'cancelled' };
    const nested: boolean[] = [];
    let closeCount = 0;
    connectSignal(getGuiDialogSignals(dialog).onClose, () => {
      closeCount++;
      nested.push(closeGuiDialog(dialog, result));
    });

    expect(closeGuiDialog(dialog, { entryId: 'other', reason: 'cancelled' })).toBe(false);
    expect(closeGuiDialog(dialog, result)).toBe(true);
    expect([closeCount, nested]).toEqual([1, [false]]);
    expect([root.visible, getActiveGuiDialogEntry(dialog)]).toEqual([false, null]);
  });
});

describe('createGuiDialog', () => {
  it('dismisses only an opted-in active entry from the supplied backdrop', () => {
    const backdrop = createGuiTestNode();
    const dialog = createGuiDialog({ backdrop });
    const results: GuiDialogCloseResult[] = [];
    connectSignal(getGuiDialogSignals(dialog).onClose, (result) => results.push(result));
    enqueueGuiDialog(dialog, { id: 'fixed', root: createGuiTestNode() });
    emitGuiPointer(backdrop, 'onClick');
    expect(getActiveGuiDialogEntry(dialog)?.id).toBe('fixed');

    closeGuiDialog(dialog, { entryId: 'fixed', reason: 'cancelled' });
    enqueueGuiDialog(dialog, { dismissOnBackdrop: true, id: 'dismissible', root: createGuiTestNode() });
    emitGuiPointer(backdrop, 'onClick');
    expect(results).toEqual([
      { entryId: 'fixed', reason: 'cancelled' },
      { entryId: 'dismissible', reason: 'dismissed' },
    ]);
  });

  it('writes visibility immediately by default and delegates only to an explicit transition adapter', () => {
    const backdrop = createGuiTestNode();
    const root = createGuiTestNode();
    root.visible = false;
    const requests: Array<{ target: unknown; value: unknown }> = [];
    const dialog = createGuiDialog({
      backdrop,
      transition: {
        run: (request) => {
          requests.push({ target: request.target, value: request.value });
          request.apply();
        },
      },
    });
    expect(backdrop.visible).toBe(false);
    enqueueGuiDialog(dialog, { id: 'entry', root });
    expect([backdrop.visible, root.visible]).toEqual([true, true]);
    expect(requests).toEqual([
      { target: backdrop, value: false },
      { target: root, value: true },
      { target: backdrop, value: true },
    ]);
  });
});

describe('disposeGuiDialog', () => {
  it('hides retained visuals, restores focus, and detaches backdrop interaction', () => {
    const focusRoot = createGuiTestNode();
    const previous = createGuiTestNode();
    const initial = createGuiTestNode();
    setNodeFocusable(previous, true);
    setNodeFocusable(initial, true);
    const focusManager = createFocusManager(focusRoot);
    setFocusedNode(focusManager, previous);
    const backdrop = createGuiTestNode();
    const entryRoot = createGuiTestNode();
    const dialog = createGuiDialog({ backdrop, focusManager });
    let closes = 0;
    connectSignal(getGuiDialogSignals(dialog).onClose, () => closes++);
    enqueueGuiDialog(dialog, { dismissOnBackdrop: true, id: 'entry', initialFocus: initial, root: entryRoot });
    expect(getFocusedNode(focusManager)).toBe(initial);

    disposeGuiDialog(dialog);
    emitGuiPointer(backdrop, 'onClick');

    expect([backdrop.visible, entryRoot.visible, getFocusedNode(focusManager)]).toEqual([false, false, previous]);
    expect([closes, enqueueGuiDialog(dialog, { id: 'late', root: createGuiTestNode() })]).toEqual([0, false]);
  });
});

describe('enqueueGuiDialog', () => {
  it('rejects duplicate IDs without changing the caller visual or queue', () => {
    const firstRoot = createGuiTestNode();
    const duplicateRoot = createGuiTestNode();
    const dialog = createGuiDialog();
    expect(enqueueGuiDialog(dialog, { id: 'same', root: firstRoot })).toBe(true);
    expect(enqueueGuiDialog(dialog, { id: 'same', root: duplicateRoot })).toBe(false);
    expect(getGuiDialogEntries(dialog).map((entry) => entry.root)).toEqual([firstRoot]);
    expect(duplicateRoot.visible).toBe(true);
  });

  it('hands focus to each explicit initial target and restores the pre-dialog focus when empty', () => {
    const focusRoot = createGuiTestNode();
    const previous = createGuiTestNode();
    const firstFocus = createGuiTestNode();
    const secondFocus = createGuiTestNode();
    for (const node of [previous, firstFocus, secondFocus]) setNodeFocusable(node, true);
    const focusManager = createFocusManager(focusRoot);
    setFocusedNode(focusManager, previous);
    const dialog = createGuiDialog({ focusManager });
    enqueueGuiDialog(dialog, { id: 'first', initialFocus: firstFocus, root: createGuiTestNode() });
    enqueueGuiDialog(dialog, { id: 'second', initialFocus: secondFocus, root: createGuiTestNode() });
    expect(getFocusedNode(focusManager)).toBe(firstFocus);

    closeGuiDialog(dialog, { entryId: 'first', reason: 'accepted' });
    expect(getFocusedNode(focusManager)).toBe(secondFocus);
    closeGuiDialog(dialog, { entryId: 'second', reason: 'accepted' });
    expect(getFocusedNode(focusManager)).toBe(previous);
  });
});

describe('getActiveGuiDialogEntry', () => {
  it('returns null for an empty queue and the current FIFO head otherwise', () => {
    const dialog = createGuiDialog();
    expect(getActiveGuiDialogEntry(dialog)).toBeNull();
    enqueueGuiDialog(dialog, { id: 'active', root: createGuiTestNode() });
    expect(getActiveGuiDialogEntry(dialog)?.id).toBe('active');
  });
});

describe('getGuiDialogEntries', () => {
  it('fills a caller-owned array in FIFO order', () => {
    const dialog = createGuiDialog();
    enqueueGuiDialog(dialog, { id: 'first', root: createGuiTestNode() });
    enqueueGuiDialog(dialog, { id: 'second', root: createGuiTestNode() });
    const out = [{ id: 'stale', root: createGuiTestNode() }];
    expect(getGuiDialogEntries(dialog, out)).toBe(out);
    expect(out.map((entry) => entry.id)).toEqual(['first', 'second']);
  });
});

describe('getGuiDialogSignals', () => {
  it('returns stable signals and reports active and queue changes', () => {
    const dialog = createGuiDialog();
    const signals = getGuiDialogSignals(dialog);
    const active: Array<string | null> = [];
    let queueChanges = 0;
    connectSignal(signals.onActiveChange, (entry) => active.push(entry?.id ?? null));
    connectSignal(signals.onQueueChange, () => queueChanges++);
    enqueueGuiDialog(dialog, { id: 'first', root: createGuiTestNode() });
    enqueueGuiDialog(dialog, { id: 'second', root: createGuiTestNode() });
    closeGuiDialog(dialog, { entryId: 'first', reason: 'accepted' });

    expect(getGuiDialogSignals(dialog)).toBe(signals);
    expect(active).toEqual(['first', 'second']);
    expect(queueChanges).toBe(3);
  });
});

describe('removeGuiDialogEntry', () => {
  it('removes queued entries only', () => {
    const firstRoot = createGuiTestNode();
    const secondRoot = createGuiTestNode();
    const dialog = createGuiDialog();
    enqueueGuiDialog(dialog, { id: 'first', root: firstRoot });
    enqueueGuiDialog(dialog, { id: 'second', root: secondRoot });

    expect(removeGuiDialogEntry(dialog, 'first')).toBe(false);
    expect(removeGuiDialogEntry(dialog, 'second')).toBe(true);
    expect(getGuiDialogEntries(dialog).map((entry) => entry.id)).toEqual(['first']);
    expect([firstRoot.visible, secondRoot.visible]).toEqual([true, false]);
  });
});
