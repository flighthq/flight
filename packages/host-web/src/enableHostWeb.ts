import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebBitmapEncode } from './webBitmapEncode';
import { enableHostWebBitmapReadback } from './webBitmapReadback';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebGlyphRasterizer } from './webGlyphRasterizer';
import { enableHostWebImage } from './webImage';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebVideoCapability } from './webVideoCapability';

export function enableHostWeb(): void {
  enableHostWebAudioDevice();
  enableHostWebBitmapEncode();
  enableHostWebBitmapReadback();
  enableHostWebFontLoading();
  enableHostWebGlyphRasterizer();
  enableHostWebImage();
  enableHostWebRaster2DSurface();
  enableHostWebVideoCapability();
}
