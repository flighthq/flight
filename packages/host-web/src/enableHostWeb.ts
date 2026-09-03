import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';

export function enableHostWeb(): void {
  enableHostWebAudioDevice();
  enableHostWebRaster2DSurface();
}
