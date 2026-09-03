import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';

export function enableHostWeb(): void {
  enableHostWebAudioDevice();
  enableHostWebFontLoading();
  enableHostWebRaster2DSurface();
}
