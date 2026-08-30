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
import { enableHostWebLifecycle } from './webLifecycle';
import { enableHostWebPermission } from './webPermissions';
import { enableHostWebPlatform } from './webPlatform';
import { enableHostWebRaster2DSurface } from './webRaster2DSurface';
import { enableHostWebSensors } from './webSensors';
import { enableHostWebVideoCapability } from './webVideoCapability';
import { enableHostWebWebcam } from './webWebcam';

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
  enableHostWebLifecycle();
  enableHostWebPermission();
  enableHostWebPlatform();
  enableHostWebRaster2DSurface();
  enableHostWebSensors();
  enableHostWebVideoCapability();
  enableHostWebWebcam();
}
