import { prepareScene3DRender } from '@flighthq/render';
import { beginWgpuRenderPass, endWgpuRenderPass } from '@flighthq/render-wgpu';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import { installCaptureTarget } from '@flighthq/tool-capture/browser';

import { camera, lights, scene, screen, screenClear, state } from './render.webgpu';

await installCaptureTarget({
  renderer: 'webgpu',
  screen,
  state,
  render() {
    const pass = beginWgpuRenderPass(state, screen, screenClear);
    prepareScene3DRender(state, scene, camera, lights);
    drawWgpuScene3D(pass, scene, camera, lights);
    endWgpuRenderPass(pass);
  },
});
