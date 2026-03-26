import type { CanvasRenderer } from '@flighthq/flight';
import { ImageSource, QuadBatch, TextureAtlas, TextureAtlasRegion } from '@flighthq/flight';
import Stats from 'stats.js';

class App {
  declare canvas: HTMLCanvasElement;
  declare element: HTMLDivElement;
  declare quadBatch: QuadBatch;
  declare renderer: CanvasRenderer;
  declare stats: Stats;

  addingBunnies: boolean = false;
  gravity: number = 0.5;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  speed: number[] = [];
  texturePath = 'assets/wabbit_alpha.png';

  constructor() {
    this.initElements();
    this.initStats();
    this.initQuadBatch();
    this.initRenderer();

    this.minX = 0;
    this.minY = 0;
    this.maxX = this.canvas.width;
    this.maxY = this.canvas.height;
  }

  addBunny(): void {
    this.quadBatch.resize(this.quadBatch.numQuads + 1);
    this.speed.push(Math.random() * 5);
    this.speed.push(Math.random() * 5 - 2.5);
  }

  enterFrame(): void {
    this.stats.begin();
    const transforms = this.quadBatch.transforms!;
    const numQuads = this.quadBatch.numQuads;
    const gravity = this.gravity;
    const speed = this.speed;
    for (let i = 0; i < numQuads; i++) {
      const 
      transforms[i] += speed[i]; // x
      transforms[i + 1] += speed[i + 1]; // y
      speed[i + 1] += this.gravity;

      const bunny = bunnies[i];
      bunny.x += bunny.speedX;
      bunny.y += bunny.speedY;
      bunny.speedY += gravity;

      if (bunny.x > maxX) {
        bunny.speedX *= -1;
        bunny.x = maxX;
      } else if (bunny.x < minX) {
        bunny.speedX *= -1;
        bunny.x = minX;
      }

      if (bunny.y > maxY) {
        bunny.speedY *= -0.8;
        bunny.y = maxY;
        if (Math.random() > 0.5) {
          bunny.speedY -= 3 + Math.random() * 4;
        }
      } else if (bunny.y < minY) {
        bunny.speedY = 0;
        bunny.y = minY;
      }
    }

    if (addingBunnies) {
      for (let i = 0; i < 100; i++) {
        addBunny();
      }
    }
    if (updateSpriteBeforeRender(state, container)) {
      renderBackground(state);
      renderSprite(state, container);
    }
    stats.end();
    requestAnimationFrame(enterFrame);
  }

  initElements(): void {
    this.element = document.createElement('div');
    this.canvas = document.createElement('canvas');

    const element = this.element;
    const canvas = this.canvas;

    canvas.width = 550;
    canvas.height = 400;
    element.appendChild(canvas);
    element.addEventListener('mousedown', this.onMouseDown);
    element.addEventListener('mouseup', this.onMouseUp);
  }

  async initQuadBatch() {
    const image = new ImageSource(await this.loadImageAndDecode(this.texturePath));
    const atlas = new TextureAtlas(image);
    atlas.addRegion(new TextureAtlasRegion(0, 0, image.width, image.height));
    this.quadBatch = new QuadBatch();
    this.quadBatch.atlas = atlas;
    this.quadBatch.transformType = 'vector2';
  }

  initRenderer(): void {
    const options = {
      backgroundColor: 0xeeddccff,
      contextAttributes: {
        alpha: false,
      },
    };

    const state = createCanvasRenderState(canvas, options);
    setSpriteRenderer(state);
    requestAnimationFrame(enterFrame);
  }

  initStats(): void {
    const stats = new Stats();
    stats.dom.style.position = 'absolute';
    stats.dom.style.left = '0px';
    stats.dom.style.top = '0px';
    document.body.appendChild(stats.dom);
  }

  initTextureAtlas(): void {}

  async loadImageAndDecode(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });
  }

  onMouseDown(): void {
    this.addingBunnies = true;
  }

  onMouseUp(): void {
    this.addingBunnies = false;
    console.log(bunnies.length + ' bunnies'); // eslint-disable-line
  }

  start(): void {
    for (let i = 0; i < 10; i++) {
      this.addBunny();
    }

    this.enterFrame();
  }
}

const app = new App();
app.start();
