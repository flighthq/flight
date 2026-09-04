import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { createTextLabel } from '@flighthq/text/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasTestSupport';
import { defaultCanvasTextLabelRenderer, drawCanvasTextLabel, initializeCanvasTextLabelData } from './canvasTextLabel';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('drawCanvasTextLabel', () => {
  it('creates RendererData with an entity runtime slot', () => {
    const data = defaultCanvasTextLabelRenderer.createData!(makeState(), createTextLabel())!;
    expect(EntityRuntimeKey in data).toBe(true);
  });

  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawCanvasTextLabel(state, renderProxy)).not.toThrow();
  });

  it('calls fillText when the text field is non-empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillText');
    drawCanvasTextLabel(state, renderProxy);
    expect(spy).toHaveBeenCalled();
  });

  it('keeps packed run alpha separate from resolved node alpha for fills and decorations', () => {
    const state = makeState();
    const node = createTextLabel();
    node.alpha = 0.5;
    node.data.text = 'hello';
    node.data.textFormat = { color: 0xff000080, underline: true };
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    renderProxy.alpha = node.alpha;
    const fills: Array<{ alpha: number; style: string | CanvasGradient | CanvasPattern }> = [];
    const strokes: Array<{ alpha: number; style: string | CanvasGradient | CanvasPattern }> = [];
    vi.spyOn(state.context, 'fillText').mockImplementation(() => {
      fills.push({ alpha: state.context.globalAlpha, style: state.context.fillStyle });
    });
    vi.spyOn(state.context, 'stroke').mockImplementation(() => {
      strokes.push({ alpha: state.context.globalAlpha, style: state.context.strokeStyle });
    });

    drawCanvasTextLabel(state, renderProxy);

    expect(fills).toEqual([{ alpha: 0.5, style: 'rgba(255, 0, 0, 0.5019607843137255)' }]);
    expect(strokes).toEqual([{ alpha: 0.5, style: 'rgba(255, 0, 0, 0.5019607843137255)' }]);
  });

  it('preserves an explicitly transparent packed run color', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hidden';
    node.data.textFormat = { color: 0x00000000 };
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const fills: Array<string | CanvasGradient | CanvasPattern> = [];
    vi.spyOn(state.context, 'fillText').mockImplementation(() => fills.push(state.context.fillStyle));

    drawCanvasTextLabel(state, renderProxy);

    expect(fills).toEqual(['rgba(0, 0, 0, 0)']);
  });
});
describe('initializeCanvasTextLabelData', () => {
  it('is the construction initializer of createCanvasTextLabelData', () => {
    expect(typeof initializeCanvasTextLabelData).toBe('function');
  });
});
