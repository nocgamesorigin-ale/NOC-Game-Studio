// Pointer input in canvas CSS pixels. One code path for touch, mouse and pen.

export interface Tap {
  x: number;
  y: number;
}

export class Input {
  private readonly taps: Tap[] = [];
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.style.touchAction = 'none'; // no browser panning/zooming on the game surface
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.taps.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  /** Taps since the previous call, oldest first. */
  drain(): Tap[] {
    return this.taps.splice(0, this.taps.length);
  }
}
