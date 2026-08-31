import { prepareScene3DRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import { installCaptureTarget } from '@flighthq/tool-capture/browser';

import { camera, lights, scene, state } from './render.webgpu';

await installCaptureTarget({
  renderer: 'webgpu',
  state,
  render() {
    renderWgpuBackground(state);
    prepareScene3DRender(state, scene, camera, lights);
    drawWgpuScene3D(state, scene, camera, lights);
    submitWgpuRenderPass(state);
  },
});
