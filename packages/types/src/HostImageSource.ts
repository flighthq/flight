// Opaque host-side image handle carried across the native seam. The web target aliases the
// platform's drawable-source union; native ports replace this alias with their own borrowed handle.
// Resources never own or free the handle.
export type HostImageSource = CanvasImageSource;
