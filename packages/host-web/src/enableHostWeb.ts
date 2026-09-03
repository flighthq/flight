import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebGlyphRasterizer } from './webGlyphRasterizer';
import { enableHostWebImage } from './webImage';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebVideoCapability } from './webVideoCapability';

export function enableHostWeb(): void {
  enableHostWebAudioDevice();
  enableHostWebFontLoading();
  enableHostWebGlyphRasterizer();
  enableHostWebImage();
  enableHostWebRaster2DSurface();
  enableHostWebVideoCapability();
}
