import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebBitmapEncode } from './webBitmapEncode';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebGlyphRasterizer } from './webGlyphRasterizer';
import { enableHostWebImage } from './webImage';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebVideoCapability } from './webVideoCapability';

export function enableHostWeb(): void {
  enableHostWebAudioDevice();
  enableHostWebBitmapEncode();
  enableHostWebFontLoading();
  enableHostWebGlyphRasterizer();
  enableHostWebImage();
  enableHostWebRaster2DSurface();
  enableHostWebVideoCapability();
}
