import { createGuiTestNode, emitGuiPointer } from './guiTestHelper';
import {
  createTooltipController,
  disposeTooltipController,
  hideTooltipController,
  showTooltipController,
} from './tooltipController';

describe('createTooltipController', () => {
  it('shows after delay at the pointer offset and hides on exit', () => {
    vi.useFakeTimers();
    const content = createGuiTestNode();
    const target = createGuiTestNode();
    createTooltipController({ content, delay: 50, offset: { x: 3, y: 4 }, target });
    emitGuiPointer(target, 'onPointerOver', { worldX: 10, worldY: 20 });
    expect(content.visible).toBe(false);
    vi.advanceTimersByTime(50);
    expect([content.visible, content.x, content.y]).toEqual([true, 13, 24]);
    emitGuiPointer(target, 'onPointerOut');
    expect(content.visible).toBe(false);
    vi.useRealTimers();
  });
});

describe('disposeTooltipController', () => {
  it('cancels delayed display', () => {
    vi.useFakeTimers();
    const content = createGuiTestNode();
    const target = createGuiTestNode();
    const controller = createTooltipController({ content, delay: 50, target });
    emitGuiPointer(target, 'onPointerOver');
    disposeTooltipController(controller);
    vi.advanceTimersByTime(50);
    expect(content.visible).toBe(false);
    vi.useRealTimers();
  });
});

describe('hideTooltipController', () => {
  it('hides immediately', () => {
    const content = createGuiTestNode();
    const controller = createTooltipController({ content, target: createGuiTestNode() });
    showTooltipController(controller);
    hideTooltipController(controller);
    expect(content.visible).toBe(false);
  });
});

describe('showTooltipController', () => {
  it('shows immediately when called', () => {
    const content = createGuiTestNode();
    const controller = createTooltipController({ content, target: createGuiTestNode() });
    showTooltipController(controller);
    expect(content.visible).toBe(true);
  });
});
