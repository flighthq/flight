import { enableHostWebAudio } from './webAudio';
import { enableHostWebAudioDevice } from './webAudioDevice';
import { enableHostWebBitmapEncode } from './webBitmapEncode';
import { enableHostWebBitmapReadback } from './webBitmapReadback';
import { enableHostWebDevice } from './webDevice';
import { enableHostWebFileSystem } from './webFilesystem';
import { enableHostWebFontLoading } from './webFontLoading';
import { enableHostWebGeolocation } from './webGeolocation';
import { enableHostWebGlyphRasterizer } from './webGlyphRasterizer';
import { enableHostWebImage } from './webImage';
import { enableHostWebMediaFileCapture } from './webMediaFileCapture';
import { enableHostWebPlatform } from './webPlatform';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebVideoCapability } from './webVideoCapability';

export function enableHostWeb(): void {
  enableHostWebAudio();
  enableHostWebAudioDevice();
  enableHostWebBitmapEncode();
  enableHostWebBitmapReadback();
  enableHostWebDevice();
  enableHostWebFileSystem();
  enableHostWebFontLoading();
  enableHostWebGeolocation();
  enableHostWebGlyphRasterizer();
  enableHostWebImage();
  enableHostWebPlatform();
  enableHostWebRaster2DSurface();
  enableHostWebVideoCapability();
  enableHostWebMediaFileCapture();
}
