import { connectSignal } from '@flighthq/signals/contract';
import type { TreeViewControllerItem } from '@flighthq/types/contract';

import { createGuiTestNode, emitGuiKeyboard, emitGuiPointer } from './guiTestHelper';
import {
  createTreeViewController,
  disposeTreeViewController,
  getTreeViewControllerSelectedItem,
  getTreeViewControllerSignals,
  isTreeViewControllerItemExpanded,
  setTreeViewControllerItemExpanded,
  setTreeViewControllerSelectedItem,
  toggleTreeViewControllerItem,
} from './treeViewController';

function tree() {
  const child: TreeViewControllerItem = { visual: createGuiTestNode() };
  const root: TreeViewControllerItem = { children: [child], visual: createGuiTestNode() };
  return { child, root };
}

describe('createTreeViewController', () => {
  it('models expansion separately from flat ListController state', () => {
    const { child, root } = tree();
    const controller = createTreeViewController({ items: [root] });
    expect(child.visual.visible).toBe(false);
    emitGuiPointer(root.visual, 'onDoubleClick');
    expect(isTreeViewControllerItemExpanded(controller, root)).toBe(true);
    expect(child.visual.visible).toBe(true);
  });

  it('navigates hierarchy with left and right', () => {
    const { child, root } = tree();
    const controller = createTreeViewController({ items: [root], selectedItem: root });
    emitGuiKeyboard(root.visual, 'onKeyDown', 'ArrowRight');
    emitGuiKeyboard(root.visual, 'onKeyDown', 'ArrowRight');
    expect(getTreeViewControllerSelectedItem(controller)).toBe(child);
  });
});

describe('disposeTreeViewController', () => {
  it('detaches item input', () => {
    const { root } = tree();
    const controller = createTreeViewController({ items: [root] });
    disposeTreeViewController(controller);
    emitGuiPointer(root.visual, 'onClick');
    expect(getTreeViewControllerSelectedItem(controller)).toBeNull();
  });
});

describe('getTreeViewControllerSelectedItem', () => {
  it('returns configured selection', () => {
    const { root } = tree();
    expect(getTreeViewControllerSelectedItem(createTreeViewController({ items: [root], selectedItem: root }))).toBe(
      root,
    );
  });
});

describe('getTreeViewControllerSignals', () => {
  it('emits activation separately from expansion', () => {
    const { root } = tree();
    const controller = createTreeViewController({ items: [root] });
    let activated = false;
    connectSignal(getTreeViewControllerSignals(controller).onActivate, () => (activated = true));
    emitGuiPointer(root.visual, 'onDoubleClick');
    expect(activated).toBe(true);
  });
});

describe('isTreeViewControllerItemExpanded', () => {
  it('reads authored initial expansion', () => {
    const { root } = tree();
    root.expanded = true;
    expect(isTreeViewControllerItemExpanded(createTreeViewController({ items: [root] }), root)).toBe(true);
  });
});

describe('setTreeViewControllerItemExpanded', () => {
  it('ignores leaves', () => {
    const { child, root } = tree();
    const controller = createTreeViewController({ items: [root] });
    setTreeViewControllerItemExpanded(controller, child, true);
    expect(isTreeViewControllerItemExpanded(controller, child)).toBe(false);
  });
});

describe('setTreeViewControllerSelectedItem', () => {
  it('rejects foreign items', () => {
    const { root } = tree();
    const controller = createTreeViewController({ items: [root] });
    setTreeViewControllerSelectedItem(controller, { visual: createGuiTestNode() });
    expect(getTreeViewControllerSelectedItem(controller)).toBeNull();
  });
});

describe('toggleTreeViewControllerItem', () => {
  it('toggles expansion in both directions', () => {
    const { root } = tree();
    const controller = createTreeViewController({ items: [root] });
    toggleTreeViewControllerItem(controller, root);
    toggleTreeViewControllerItem(controller, root);
    expect(isTreeViewControllerItemExpanded(controller, root)).toBe(false);
  });
});
