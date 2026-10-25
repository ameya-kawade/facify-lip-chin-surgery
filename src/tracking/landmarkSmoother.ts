import { OneEuroFilter, OneEuroConfig, DEFAULT_ONE_EURO_CONFIG } from './oneEuroFilter';

export interface Point2D {
  x: number;
  y: number;
  z?: number;
}

export class LandmarkSmoother {
  private xFilters: OneEuroFilter[] = [];
  private yFilters: OneEuroFilter[] = [];
  private count: number = 0;

  constructor(numLandmarks: number = 478, config: Partial<OneEuroConfig> = DEFAULT_ONE_EURO_CONFIG) {
    this.count = numLandmarks;
    for (let i = 0; i < numLandmarks; i++) {
      this.xFilters.push(new OneEuroFilter(config));
      this.yFilters.push(new OneEuroFilter(config));
    }
  }

  smooth(landmarks: Point2D[], timestampMs: number): Point2D[] {
    // If landmark count changes or mismatch, reinit
    if (landmarks.length !== this.count) {
      this.count = landmarks.length;
      this.xFilters = [];
      this.yFilters = [];
      for (let i = 0; i < this.count; i++) {
        this.xFilters.push(new OneEuroFilter());
        this.yFilters.push(new OneEuroFilter());
      }
    }

    const smoothed: Point2D[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const raw = landmarks[i];
      smoothed[i] = {
        x: this.xFilters[i].filter(raw.x, timestampMs),
        y: this.yFilters[i].filter(raw.y, timestampMs),
        z: raw.z,
      };
    }
    return smoothed;
  }

  reset(): void {
    for (let i = 0; i < this.count; i++) {
      this.xFilters[i].reset();
      this.yFilters[i].reset();
    }
  }
}
