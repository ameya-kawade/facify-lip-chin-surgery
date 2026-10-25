import { describe, it, expect } from 'vitest';
import { OneEuroFilter } from '../oneEuroFilter';
import { LandmarkSmoother } from '../landmarkSmoother';
import { estimatePoseFromMatrix } from '../poseEstimator';

describe('OneEuroFilter', () => {
  it('smooths noisy stationary signals', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.0 });
    const baseline = 100;
    const noisyValues = [100, 102, 98, 101, 99, 103, 97];
    let timestamp = 0;
    const smoothedValues: number[] = [];

    for (const val of noisyValues) {
      timestamp += 33.3; // ~30fps
      smoothedValues.push(filter.filter(val, timestamp));
    }

    const lastSmoothed = smoothedValues[smoothedValues.length - 1];
    expect(Math.abs(lastSmoothed - baseline)).toBeLessThan(2.0);
    for (const s of smoothedValues) {
      expect(s).toBeGreaterThan(97.0);
      expect(s).toBeLessThan(103.0);
    }
  });

  it('adapts quickly during fast motion when beta is set', () => {
    const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.5 });
    let timestamp = 0;
    filter.filter(0, timestamp);
    timestamp += 33;
    const valAfterJump = filter.filter(100, timestamp);
    expect(valAfterJump).toBeGreaterThan(30);
  });
});

describe('LandmarkSmoother', () => {
  it('smooths 478 landmarks simultaneously', () => {
    const smoother = new LandmarkSmoother(478);
    const mockLandmarks = Array.from({ length: 478 }, (_, i) => ({
      x: 0.5 + Math.sin(i) * 0.1,
      y: 0.5 + Math.cos(i) * 0.1,
      z: 0,
    }));

    const smoothed = smoother.smooth(mockLandmarks, 100);
    expect(smoothed).toHaveLength(478);
    expect(smoothed[0].x).toBeCloseTo(mockLandmarks[0].x, 4);
    expect(smoothed[0].y).toBeCloseTo(mockLandmarks[0].y, 4);
  });
});

describe('poseEstimator', () => {
  it('identifies frontal identity matrix as frontal', () => {
    const identity = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const pose = estimatePoseFromMatrix(identity);
    expect(pose.isFrontal).toBe(true);
    expect(pose.score).toBeGreaterThan(0.95);
  });
});
