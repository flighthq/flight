import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebGlyphRasterizer } from './webGlyphRasterizer';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebVideoCapability } from './webVideoCapability';

export function enableHostWeb(): void {
  enableHostWebAudioDevice();
  enableHostWebFontLoading();
  enableHostWebGlyphRasterizer();
  enableHostWebRaster2DSurface();
  enableHostWebVideoCapability();
}
