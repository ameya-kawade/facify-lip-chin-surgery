export interface OneEuroConfig {
  minCutoff: number; // Hz, default 0.5
  beta: number;      // cutoff slope, default 0.05
  dCutoff?: number;  // Hz, default 1.0
}

export const DEFAULT_ONE_EURO_CONFIG: OneEuroConfig = {
  minCutoff: 0.5,
  beta: 0.05,
  dCutoff: 1.0,
};

class LowPassFilter {
  private hatXPrev: number | null = null;

  alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x: number, alpha: number): number {
    if (this.hatXPrev === null) {
      this.hatXPrev = x;
      return x;
    }
    const hatX = alpha * x + (1.0 - alpha) * this.hatXPrev;
    this.hatXPrev = hatX;
    return hatX;
  }

  reset(): void {
    this.hatXPrev = null;
  }
}

export class OneEuroFilter {
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private prevT: number | null = null;
  private prevX: number | null = null;
  private config: OneEuroConfig;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.config = {
      ...DEFAULT_ONE_EURO_CONFIG,
      ...config,
    };
  }

  filter(x: number, timestampMs: number): number {
    if (this.prevT === null || this.prevX === null) {
      this.prevT = timestampMs;
      this.prevX = x;
      return x;
    }

    const dt = (timestampMs - this.prevT) / 1000.0;
    this.prevT = timestampMs;

    if (dt <= 0) {
      return this.prevX;
    }

    // Derivative estimation
    const dx = (x - this.prevX) / dt;
    this.prevX = x;

    const dCutoff = this.config.dCutoff ?? 1.0;
    const aD = this.dxFilter.alpha(dCutoff, dt);
    const edx = this.dxFilter.filter(dx, aD);

    // Adaptive cutoff based on rate of change
    const cutoff = this.config.minCutoff + this.config.beta * Math.abs(edx);
    const a = this.xFilter.alpha(cutoff, dt);

    return this.xFilter.filter(x, a);
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.prevT = null;
    this.prevX = null;
  }
}

export class OneEuroFilter1D extends OneEuroFilter {}

export class OneEuroFilter2D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.fx = new OneEuroFilter(config);
    this.fy = new OneEuroFilter(config);
  }

  filter(point: { x: number; y: number }, timestampMs: number): { x: number; y: number } {
    return {
      x: this.fx.filter(point.x, timestampMs),
      y: this.fy.filter(point.y, timestampMs),
    };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
