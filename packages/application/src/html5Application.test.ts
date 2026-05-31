import { createHTML5Application } from './html5Application';

describe('createHTML5Application', () => {
  it('is an alias for createApplication', () => {
    const app = createHTML5Application();
    expect(app.onUpdate).toBeDefined();
    expect(app.onRender).toBeDefined();
    expect(app.onExit).toBeDefined();
  });
});
