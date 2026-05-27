import { ImageChannel } from './imageChannel';

describe('ImageChannel', () => {
  it('has Red = 0', () => {
    expect(ImageChannel.Red).toBe(0);
  });

  it('has Green = 1', () => {
    expect(ImageChannel.Green).toBe(1);
  });

  it('has Blue = 2', () => {
    expect(ImageChannel.Blue).toBe(2);
  });

  it('has Alpha = 3', () => {
    expect(ImageChannel.Alpha).toBe(3);
  });
});
