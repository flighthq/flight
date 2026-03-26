import { CanvasRenderer, Vector2 } from '@flighthq/flight';
import { ImageSource, QuadBatch, TextureAtlas, TextureAtlasRegion } from '@flighthq/flight';
import Stats from 'stats.js';

class App {
  declare canvas: HTMLCanvasElement;
  declare element: HTMLDivElement;
  declare quadBatch: QuadBatch;
  declare renderer: CanvasRenderer;
  declare stats: Stats;

  addingBunnies: boolean = false;
  bunnyPosition: Vector2[] = [];
  bunnySpeed: Vector2[] = [];
  gravity: number = 0.5;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;

  constructor(bunny: ImageSource) {
    this.initElements();
    this.initStats();
    this.initQuadBatch(bunny);
    this.initRenderer();

    this.minX = 0;
    this.minY = 0;
    this.maxX = this.canvas.width;
    this.maxY = this.canvas.height;
  }

  addBunny(): void {
    this.quadBatch.resize(this.quadBatch.instanceCount + 1);
    this.bunnyPosition.push(new Vector2());
    this.bunnySpeed.push(new Vector2(Math.random() * 5, Math.random() * 5 - 2.5));
  }

  enterFrame = (): void => {
    this.stats.begin();

    const { addingBunnies, quadBatch, gravity, minX, minY, maxX, maxY, renderer } = this;
    const instanceCount = quadBatch.instanceCount;

    for (let i = 0; i < instanceCount; i++) {
      const position = this.bunnyPosition[i];
      const speed = this.bunnySpeed[i];
      position.add(speed);
      position.x += speed.x;
      position.y += speed.y;
      speed.y += gravity;

      if (position.x > maxX) {
        speed.x *= -1;
        position.x = maxX;
      } else if (position.x < minX) {
        speed.x *= -1;
        position.x = minX;
      }

      if (position.y > maxY) {
        speed.y *= -0.8;
        position.y = maxY;
        if (Math.random() > 0.5) {
          speed.y -= 3 + Math.random() * 4;
        }
      } else if (position.y < minY) {
        speed.y = 0;
        position.y = minY;
      }

      quadBatch.writeVector(i, position);
    }

    if (addingBunnies) {
      for (let i = 0; i < 100; i++) {
        this.addBunny();
      }
    }

    renderer.render(quadBatch);
    this.stats.end();
    requestAnimationFrame(this.enterFrame);
  };

  initElements(): void {
    this.element = document.createElement('div');
    this.canvas = document.createElement('canvas');

    const element = this.element;
    const canvas = this.canvas;

    canvas.width = 550;
    canvas.height = 400;
    element.appendChild(canvas);
    element.addEventListener('mousedown', this.onMouseDown.bind(this));
    element.addEventListener('mouseup', this.onMouseUp.bind(this));
    document.body.appendChild(element);
  }

  initQuadBatch(bunny: ImageSource) {
    const atlas = new TextureAtlas(bunny);
    atlas.addRegion(new TextureAtlasRegion(0, 0, bunny.width, bunny.height));
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

    this.renderer = new CanvasRenderer(this.canvas, options);
  }

  initStats(): void {
    this.stats = new Stats();
    const dom = this.stats.dom;
    dom.style.position = 'absolute';
    dom.style.left = '0px';
    dom.style.top = '0px';
    document.body.appendChild(dom);
  }

  onMouseDown(): void {
    this.addingBunnies = true;
  }

  onMouseUp(): void {
    this.addingBunnies = false;
    console.log(this.bunnyPosition.length + ' bunnies'); // eslint-disable-line
  }

  start(): void {
    for (let i = 0; i < 10; i++) {
      this.addBunny();
    }

    this.enterFrame();
  }
}

async function loadImageAndDecode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

const bunny = new ImageSource(await loadImageAndDecode('assets/wabbit_alpha.png'));
const app = new App(bunny);
app.start();
