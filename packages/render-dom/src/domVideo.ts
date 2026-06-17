import { createEntity } from '@flighthq/entity';
import type {
  DisplayObjectRenderer,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderNode2D,
  RenderState,
  Video,
} from '@flighthq/types';

import { applyDOMStyle, prepareDOMElement, setDOMRendererElement } from './domStyle';

interface DOMVideoData extends RendererData {
  element: HTMLVideoElement | null;
}

function createDOMVideoData(_state: RenderState, _source: Renderable): DOMVideoData {
  return createEntity({ element: null });
}

export function drawDOMVideo(state: DOMRenderState, renderNode: RenderNode2D): void {
  const data = renderNode.rendererData as DOMVideoData | null;
  if (data === null) return;

  const source = renderNode.source as Video;
  const element = source.data.source?.element ?? null;
  if (element === null || element.videoWidth === 0 || element.videoHeight === 0) return;

  if (data.element !== element) {
    data.element = element;
    prepareDOMElement(element);
  }

  element.style.width = `${element.videoWidth}px`;
  element.style.height = `${element.videoHeight}px`;

  applyDOMStyle(state, element, renderNode);
  setDOMRendererElement(state, element);
}

export function drawDOMVideoMask(state: DOMRenderState, renderNode: RenderNode2D): void {
  drawDOMVideo(state, renderNode);
}

export const defaultDOMVideoRenderer: DisplayObjectRenderer = {
  createData: createDOMVideoData,
  submit: drawDOMVideo,
};
