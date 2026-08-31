import { prepareScene2DRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { installCaptureTarget } from '@flighthq/tool-capture/browser';

import { root, state } from './render.webgpu';

await installCaptureTarget({
  renderer: 'webgpu',
  state,
  render() {
    prepareScene2DRender(state, root);
    renderWgpuBackground(state);
    renderWgpuScene2D(state, root);
    submitWgpuRenderPass(state);
  },
});
