export default class BitmapFilter {
  constructor() {}

  static clone(_: BitmapFilter): BitmapFilter {
    // set invalidation on filter when cloning
    return new BitmapFilter();
  }
}
