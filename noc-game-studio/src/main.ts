// Boot: canvas sized to the screen (with device pixel ratio), a fixed-step
// game loop, input, and the first `ready` event for the GameKit preview.
import { Game, LEVEL_COUNT } from './game';
import { DEBUG, emit, registerLevels } from './gamekit';
import { Input } from './input';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const game = new Game();
const input = new Input(canvas);

// Expose the safe-area top inset to the game as a CSS variable it can read.
document.documentElement.style.setProperty('--sat', 'env(safe-area-inset-top, 0px)');

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.resize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 50));
resize();

let last = performance.now();
let ready = false;

function frame(now: number): void {
  // Clamp dt so a background tab or a breakpoint never makes the game jump.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    game.update(dt, input.drain());
    game.draw(ctx);
    if (DEBUG) drawDebug(dt);
  }
  if (!ready) {
    ready = true;
    emit('ready', { width: canvas.clientWidth, height: canvas.clientHeight });
    // Lists the levels in the GameKit preview (dropdown + Levels panel with thumbnails).
    registerLevels({
      count: LEVEL_COUNT,
      current: () => game.level,
      goTo: (level) => game.startLevel(level),
      canvas,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function drawDebug(dt: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, canvas.clientHeight - 24, canvas.clientWidth, 24);
  ctx.fillStyle = '#9fe';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(1 / Math.max(dt, 1e-3))} fps  ${JSON.stringify(game.snapshot())}`, 8, canvas.clientHeight - 12);
  ctx.restore();
}
