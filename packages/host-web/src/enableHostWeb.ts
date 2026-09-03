import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebVideoCapability } from './webVideoCapability';

export function enableHostWeb(): void {
  enableHostWebAudioDevice();
  enableHostWebFontLoading();
  enableHostWebRaster2DSurface();
  enableHostWebVideoCapability();
}
