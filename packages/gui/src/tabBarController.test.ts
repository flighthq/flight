import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import {
  createTabBarController,
  disposeTabBarController,
  getTabBarControllerSelectedIndex,
  getTabBarControllerSignals,
  setTabBarControllerSelectedIndex,
} from './tabBarController';

describe('createTabBarController', () => {
  it('swaps selected and unselected visuals from clicks', () => {
    const a = { selectedState: createGuiTestNode(), unselectedState: createGuiTestNode() };
    const b = { selectedState: createGuiTestNode(), unselectedState: createGuiTestNode() };
    const controller = createTabBarController({ tabs: [a, b] });
    emitGuiPointer(b.unselectedState, 'onClick');
    expect(getTabBarControllerSelectedIndex(controller)).toBe(1);
    expect([b.selectedState.visible, b.unselectedState.visible]).toEqual([true, false]);
  });
});

describe('disposeTabBarController', () => {
  it('detaches tab listeners', () => {
    const tab = { selectedState: createGuiTestNode(), unselectedState: createGuiTestNode() };
    const controller = createTabBarController({ selectedIndex: -1, tabs: [tab] });
    disposeTabBarController(controller);
    emitGuiPointer(tab.unselectedState, 'onClick');
    expect(getTabBarControllerSelectedIndex(controller)).toBe(-1);
  });
});

describe('getTabBarControllerSelectedIndex', () => {
  it('reports the initial index', () => {
    expect(getTabBarControllerSelectedIndex(createTabBarController({ selectedIndex: -1, tabs: [] }))).toBe(-1);
  });
});

describe('getTabBarControllerSignals', () => {
  it('returns stable signals', () => {
    const controller = createTabBarController({ tabs: [] });
    expect(getTabBarControllerSignals(controller)).toBe(getTabBarControllerSignals(controller));
  });
});

describe('setTabBarControllerSelectedIndex', () => {
  it('normalizes invalid indices', () => {
    const controller = createTabBarController({ tabs: [] });
    setTabBarControllerSelectedIndex(controller, 2);
    expect(getTabBarControllerSelectedIndex(controller)).toBe(-1);
  });
});
