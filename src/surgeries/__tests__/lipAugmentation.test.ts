import { describe, it, expect } from 'vitest';
import { deformLipMesh, DEFAULT_LIP_SLIDERS } from '../lipAugmentation';
import { buildLipMesh } from '../../mesh/lipMeshBuilder';
import { LIP_LANDMARK_INDICES } from '../../mesh/lipControlPoints';
import { Point2D } from '../../tracking/landmarkSmoother';

describe('LipAugmentation Deformation Engine (Phase 3 & 7)', () => {
  const mockLandmarks: Point2D[] = Array.from({ length: 478 }, (_, i) => ({
    x: 0.5 + Math.sin(i * 0.1) * 0.2,
    y: 0.5 + Math.cos(i * 0.1) * 0.2,
    z: 0,
  }));

  mockLandmarks[LIP_LANDMARK_INDICES.leftCorner] = { x: 0.40, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.rightCorner] = { x: 0.60, y: 0.65 };
  mockLandmarks[LIP_LANDMARK_INDICES.cupidsBowCenter] = { x: 0.50, y: 0.63 };
  mockLandmarks[LIP_LANDMARK_INDICES.lowerCenter] = { x: 0.50, y: 0.68 };

  const baseMesh = buildLipMesh(mockLandmarks);

  it('returns identical coordinates when all sliders are zero (identity fast path)', () => {
    const deformed = deformLipMesh(mockLandmarks, baseMesh, DEFAULT_LIP_SLIDERS, 1.0);
    expect(deformed).toHaveLength(baseMesh.vertices.length);
    for (let i = 0; i < mockLandmarks.length; i++) {
      expect(deformed[i].x).toBe(mockLandmarks[i].x);
      expect(deformed[i].y).toBe(mockLandmarks[i].y);
    }
  });

  it('keeps mouth corners anchored during fullness adjustments', () => {
    const leftCornerIdx = LIP_LANDMARK_INDICES.leftCorner;
    const rightCornerIdx = LIP_LANDMARK_INDICES.rightCorner;

    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_LIP_SLIDERS, upperFullness: 20, lowerFullness: 20, overallFullness: 20, lipWidth: 0 },
      1.0
    );

    expect(deformed[leftCornerIdx].x).toBeCloseTo(mockLandmarks[leftCornerIdx].x, 5);
    expect(deformed[leftCornerIdx].y).toBeCloseTo(mockLandmarks[leftCornerIdx].y, 5);
    expect(deformed[rightCornerIdx].x).toBeCloseTo(mockLandmarks[rightCornerIdx].x, 5);
    expect(deformed[rightCornerIdx].y).toBeCloseTo(mockLandmarks[rightCornerIdx].y, 5);
  });

  it('moves upper lip upward on upper fullness without affecting lower lip or corners', () => {
    const cupidsBowIdx = LIP_LANDMARK_INDICES.cupidsBowCenter;
    const lowerCenterIdx = LIP_LANDMARK_INDICES.lowerCenter;

    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_LIP_SLIDERS, upperFullness: 20, lowerFullness: 0, overallFullness: 0, lipWidth: 0 },
      1.0
    );

    expect(deformed[cupidsBowIdx].y).toBeLessThan(mockLandmarks[cupidsBowIdx].y);
    expect(deformed[lowerCenterIdx].y).toBeCloseTo(mockLandmarks[lowerCenterIdx].y, 4);
  });

  it('moves corners outward horizontally on positive width and inward on negative width', () => {
    const leftCornerIdx = LIP_LANDMARK_INDICES.leftCorner;
    const rightCornerIdx = LIP_LANDMARK_INDICES.rightCorner;

    // Positive width: expansion
    const expanded = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_LIP_SLIDERS, upperFullness: 0, lowerFullness: 0, overallFullness: 0, lipWidth: 15 },
      1.0
    );
    expect(expanded[leftCornerIdx].x).toBeLessThan(mockLandmarks[leftCornerIdx].x);
    expect(expanded[rightCornerIdx].x).toBeGreaterThan(mockLandmarks[rightCornerIdx].x);

    // Negative width: contraction
    const contracted = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_LIP_SLIDERS, upperFullness: 0, lowerFullness: 0, overallFullness: 0, lipWidth: -15 },
      1.0
    );
    expect(contracted[leftCornerIdx].x).toBeGreaterThan(mockLandmarks[leftCornerIdx].x);
    expect(contracted[rightCornerIdx].x).toBeLessThan(mockLandmarks[rightCornerIdx].x);
  });

  it('demonstrates strictly monotonic displacement from 0% -> 25% -> 50% -> 100%', () => {
    const cupidsBowIdx = LIP_LANDMARK_INDICES.cupidsBowCenter;
    const d0 = mockLandmarks[cupidsBowIdx].y - deformLipMesh(mockLandmarks, baseMesh, { ...DEFAULT_LIP_SLIDERS, upperFullness: 0, lowerFullness: 0, overallFullness: 0, lipWidth: 0 })[cupidsBowIdx].y;
    const d25 = mockLandmarks[cupidsBowIdx].y - deformLipMesh(mockLandmarks, baseMesh, { ...DEFAULT_LIP_SLIDERS, upperFullness: 5, lowerFullness: 0, overallFullness: 0, lipWidth: 0 })[cupidsBowIdx].y;
    const d50 = mockLandmarks[cupidsBowIdx].y - deformLipMesh(mockLandmarks, baseMesh, { ...DEFAULT_LIP_SLIDERS, upperFullness: 10, lowerFullness: 0, overallFullness: 0, lipWidth: 0 })[cupidsBowIdx].y;
    const d100 = mockLandmarks[cupidsBowIdx].y - deformLipMesh(mockLandmarks, baseMesh, { ...DEFAULT_LIP_SLIDERS, upperFullness: 20, lowerFullness: 0, overallFullness: 0, lipWidth: 0 })[cupidsBowIdx].y;

    expect(d0).toBe(0);
    expect(d25).toBeGreaterThan(d0);
    expect(d50).toBeGreaterThan(d25);
    expect(d100).toBeGreaterThan(d50);
  });

  it('disables deformation when effectScale is 0', () => {
    const cupidsBowIdx = LIP_LANDMARK_INDICES.cupidsBowCenter;
    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_LIP_SLIDERS, upperFullness: 20, lowerFullness: 20, overallFullness: 20, lipWidth: 15 },
      0.0 // completely gated off
    );

    expect(deformed[cupidsBowIdx].y).toBeCloseTo(mockLandmarks[cupidsBowIdx].y, 6);
  });

  it('leaves non-lip face vertices completely untouched', () => {
    const foreheadIdx = 10;
    const deformed = deformLipMesh(
      mockLandmarks,
      baseMesh,
      { ...DEFAULT_LIP_SLIDERS, upperFullness: 20, lowerFullness: 20, overallFullness: 20, lipWidth: 15 },
      1.0
    );

    expect(deformed[foreheadIdx].x).toBe(mockLandmarks[foreheadIdx].x);
    expect(deformed[foreheadIdx].y).toBe(mockLandmarks[foreheadIdx].y);
  });
});
