import { prepareScene2DRender } from '@flighthq/render';
import { beginWgpuRenderPass, endWgpuRenderPass } from '@flighthq/render-wgpu';
import { renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { installCaptureTarget } from '@flighthq/tool-capture/browser';

import { root, screen, screenClear, state } from './render.webgpu';

await installCaptureTarget({
  renderer: 'webgpu',
  screen,
  state,
  render() {
    prepareScene2DRender(state, root);
    const pass = beginWgpuRenderPass(state, screen, screenClear);
    renderWgpuScene2D(pass, root);
    endWgpuRenderPass(pass);
  },
});
