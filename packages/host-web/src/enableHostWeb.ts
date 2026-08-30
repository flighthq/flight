import { enableHostWebAudio } from './webAudio';
import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebBitmapEncode } from './webBitmapEncode';
import { enableHostWebBitmapReadback } from './webBitmapReadback';
import { enableHostWebFileSystem } from './webFilesystem';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebGeolocation } from './webGeolocation';
import { enableHostWebGlyphRasterizer } from './webGlyphRasterizer';
import { enableHostWebImage } from './webImage';
import { enableHostWebMediaFileCapture } from './webMediaFileCapture';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebVideoCapability } from './webVideoCapability';

export function enableHostWeb(): void {
  enableHostWebAudio();
  enableHostWebAudioDevice();
  enableHostWebBitmapEncode();
  enableHostWebBitmapReadback();
  enableHostWebFileSystem();
  enableHostWebFontLoading();
  enableHostWebGeolocation();
  enableHostWebGlyphRasterizer();
  enableHostWebImage();
  enableHostWebRaster2DSurface();
  enableHostWebVideoCapability();
  enableHostWebMediaFileCapture();
}
