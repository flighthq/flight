import { createWebApplication } from './webApplication';

describe('createWebApplication', () => {
  it('is an alias for createApplication', () => {
    const app = createWebApplication();
    expect(app.onUpdate).toBeDefined();
    expect(app.onRender).toBeDefined();
    expect(app.onExit).toBeDefined();
  });
});
