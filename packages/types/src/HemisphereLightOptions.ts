export interface HemisphereLightOptions {
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding HemisphereLight.groundColor.
  groundColor?: number;
  intensity?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding HemisphereLight.skyColor.
  skyColor?: number;
}
