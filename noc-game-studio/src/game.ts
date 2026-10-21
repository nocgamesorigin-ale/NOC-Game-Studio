// NOC Game Studio — gameplay.
//
// A small but complete tap game to start from: bubbles appear and shrink, tap
// them before they vanish. Pop enough to clear the level; let three escape and
// you lose. Replace the rules, keep the shape: `update(dt)` + `draw(ctx)` +
// a tiny state machine, with `emit()` at the moments that matter.
import { emit, levelChanged, type GameEventData } from './gamekit';
import type { Tap } from './input';

export type Phase = 'title' | 'playing' | 'won' | 'lost';

interface Bubble {
  x: number;
  y: number;
  r: number;
  /** Seconds the bubble lives before it escapes. */
  life: number;
  age: number;
  hue: number;
}

interface Burst {
  x: number;
  y: number;
  age: number;
  hue: number;
}

export interface LevelRules {
  popsToWin: number;
  spawnEvery: number;
  bubbleLife: number;
  maxMisses: number;
}

/** How many levels the preview's level list shows. Raise it as you design more. */
export const LEVEL_COUNT = 20;

export function rulesFor(level: number): LevelRules {
  return {
    popsToWin: 8 + level * 2,
    spawnEvery: Math.max(0.35, 1.0 - level * 0.08),
    bubbleLife: Math.max(0.9, 2.2 - level * 0.15),
    maxMisses: 3,
  };
}

export class Game {
  phase: Phase = 'title';
  level = 1;
  score = 0;
  best = Number(localStorage.getItem('noc-game-studio.best') ?? 0) || 0;

  private width = 0;
  private height = 0;
  private rules = rulesFor(1);
  private pops = 0;
  private misses = 0;
  private spawnTimer = 0;
  private bubbles: Bubble[] = [];
  private bursts: Burst[] = [];
  private shake = 0;
  private time = 0;
  private hue = 222;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  // ---- state changes -------------------------------------------------------

  startLevel(level: number): void {
    this.level = level;
    this.rules = rulesFor(level);
    this.pops = 0;
    this.misses = 0;
    this.spawnTimer = this.rules.spawnEvery; // the seeded opening bubbles come first
    this.bubbles = [];
    this.bursts = [];
    this.phase = 'playing';
    this.hue = (222 + (level - 1) * 23) % 360; // each level gets its own sky
    // A few bubbles from the start, placed by a per-level seed: the level looks
    // the same every time it opens (and its thumbnail matches).
    const rand = seeded(level * 9973);
    for (let i = 0; i < Math.min(2 + Math.floor(level / 3), 6); i++) this.spawn(rand, rand() * 0.5);
    emit('levelStart', { level, popsToWin: this.rules.popsToWin });
    levelChanged(level);
  }

  private win(): void {
    this.phase = 'won';
    this.saveBest();
    emit('win', { level: this.level, score: this.score });
  }

  private lose(): void {
    this.phase = 'lost';
    this.saveBest();
    emit('lose', { level: this.level, score: this.score, pops: this.pops });
  }

  private saveBest(): void {
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('noc-game-studio.best', String(this.best));
    }
  }

  // ---- update --------------------------------------------------------------

  update(dt: number, taps: Tap[]): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < 0.45);

    if (this.phase !== 'playing') {
      if (taps.length > 0) this.advance();
      return;
    }

    for (const tap of taps) this.handleTap(tap);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = this.rules.spawnEvery;
    }

    for (const b of this.bubbles) b.age += dt;
    const escaped = this.bubbles.filter((b) => b.age >= b.life);
    if (escaped.length > 0) {
      this.bubbles = this.bubbles.filter((b) => b.age < b.life);
      this.misses += escaped.length;
      this.shake = 1;
      emit('miss', { misses: this.misses });
      if (this.misses >= this.rules.maxMisses) this.lose();
    }
  }

  private advance(): void {
    if (this.phase === 'title') this.startLevel(1);
    else if (this.phase === 'won') this.startLevel(this.level + 1);
    else if (this.phase === 'lost') {
      this.score = 0;
      this.startLevel(1);
    }
  }

  private handleTap(tap: Tap): void {
    // Newest bubble on top wins the tap.
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const r = this.radiusOf(b);
      const dx = tap.x - b.x;
      const dy = tap.y - b.y;
      if (dx * dx + dy * dy <= (r + 12) * (r + 12)) {
        this.bubbles.splice(i, 1);
        this.bursts.push({ x: b.x, y: b.y, age: 0, hue: b.hue });
        this.pops++;
        this.score += 10 + Math.round(20 * (1 - b.age / b.life)); // faster taps score more
        if (this.pops >= this.rules.popsToWin) this.win();
        return;
      }
    }
  }

  private spawn(rand: () => number = Math.random, age = 0): void {
    const margin = 56;
    const r = 28 + rand() * 22;
    this.bubbles.push({
      x: margin + rand() * Math.max(1, this.width - margin * 2),
      y: margin + 80 + rand() * Math.max(1, this.height - margin * 2 - 140),
      r,
      life: this.rules.bubbleLife,
      age: age * this.rules.bubbleLife,
      hue: Math.floor(rand() * 360),
    });
  }

  private radiusOf(b: Bubble): number {
    return b.r * (1 - b.age / b.life) + 6;
  }

  // ---- draw ----------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D): void {
    const { width: w, height: h } = this;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * this.shake, (Math.random() - 0.5) * 8 * this.shake);

    // background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${this.hue}, 38%, 16%)`);
    g.addColorStop(1, `hsl(${this.hue}, 30%, 7%)`);
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, w + 20, h + 20);

    // bubbles
    for (const b of this.bubbles) {
      const r = this.radiusOf(b);
      const t = b.age / b.life;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${b.hue}, 85%, ${65 - t * 25}%, ${0.95 - t * 0.4})`;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = `hsla(${b.hue}, 90%, 85%, 0.9)`;
      ctx.stroke();
      // highlight
      ctx.beginPath();
      ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
    }

    // bursts
    for (const p of this.bursts) {
      const t = p.age / 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20 + t * 50, 0, Math.PI * 2);
      ctx.lineWidth = 6 * (1 - t);
      ctx.strokeStyle = `hsla(${p.hue}, 90%, 70%, ${1 - t})`;
      ctx.stroke();
    }

    this.drawHud(ctx);
    if (this.phase !== 'playing') this.drawOverlay(ctx);
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const top = 18 + safeTop();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${this.level}`, 18, top);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.score}`, this.width - 18, top);

    // progress bar
    const barW = this.width - 36;
    const y = top + 30;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, 18, y, barW, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#5ee6a8';
    roundRect(ctx, 18, y, barW * Math.min(1, this.pops / this.rules.popsToWin), 8, 4);
    ctx.fill();

    // misses
    ctx.textAlign = 'center';
    ctx.font = '16px system-ui, sans-serif';
    const hearts = '♥'.repeat(Math.max(0, this.rules.maxMisses - this.misses)) + '♡'.repeat(this.misses);
    ctx.fillStyle = '#ff6b8a';
    ctx.fillText(hearts, this.width / 2, y + 16);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    const { width: w, height: h } = this;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';

    const title = this.phase === 'title' ? 'NOC Game Studio' : this.phase === 'won' ? `Level ${this.level} clear!` : 'Out of hearts';
    const sub =
      this.phase === 'title'
        ? 'Tap the bubbles before they vanish'
        : this.phase === 'won'
          ? `Score ${this.score} · Best ${this.best}`
          : `Score ${this.score} · Best ${this.best}`;
    const cta = this.phase === 'title' ? 'Tap to play' : this.phase === 'won' ? 'Tap for next level' : 'Tap to try again';

    ctx.font = '800 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(title, w / 2, h * 0.42);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(sub, w / 2, h * 0.42 + 40);
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 4);
    ctx.fillStyle = `rgba(94, 230, 168, ${pulse})`;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText(cta, w / 2, h * 0.42 + 96);
  }

  /** Anything the HUD/debug overlay may want to show. */
  snapshot(): GameEventData {
    return { phase: this.phase, level: this.level, score: this.score, bubbles: this.bubbles.length };
  }
}

/** Small deterministic PRNG (mulberry32) for repeatable level layouts. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Top safe-area inset (notch) in CSS px, from the `--sat` variable main.ts sets. */
function safeTop(): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--sat');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
