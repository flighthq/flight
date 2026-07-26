import { createEntity } from '@flighthq/entity/contract';
import type {
  Scene2DRenderer,
  DomRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Video,
} from '@flighthq/types/contract';

import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';

interface DomVideoData extends RendererData {
  element: HTMLVideoElement | null;
}

function createDomVideoData(_state: RenderState, _source: Renderable): DomVideoData {
  return createEntity({ element: null });
}

export function drawDomVideo(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomVideoData | null;
  if (data === null) return;

  const source = renderProxy.source as Video;
  const element = source.data.source?.element ?? null;
  if (element === null || element.videoWidth === 0 || element.videoHeight === 0) return;

  if (data.element !== element) {
    data.element = element;
    prepareDomElement(element);
  }

  element.style.width = `${element.videoWidth}px`;
  element.style.height = `${element.videoHeight}px`;

  applyDomStyle(state, element, renderProxy);
  setDomRendererElement(state, element);
}

export const defaultDomVideoRenderer: Scene2DRenderer = {
  createData: createDomVideoData,
  submit: drawDomVideo,
};
