import { Point2D } from '../tracking/landmarkSmoother';

/**
 * Key landmark indices on MediaPipe Face Mesh:
 * Mouth corners: Left 61, Right 291
 * Upper vermilion border (outer): 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291
 * Lower vermilion border (outer): 61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291
 * Upper inner lip border: 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308
 * Lower inner lip border: 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308
 */
export const LIP_LANDMARK_INDICES = {
  leftCorner: 61,
  rightCorner: 291,
  upperOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  lowerOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  upperInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  lowerInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  cupidsBowCenter: 0,
  lowerCenter: 17,
  innerCenterUpper: 13,
  innerCenterLower: 14,
  philtrumUpper: 164, // landmark right above cupid's bow
  chinTransition: 18, // landmark below lower lip
};

export interface LipSubmeshVertex {
  id: number;
  x: number;
  y: number;
  /**
   * If tracking a canonical landmark index, this is the index (0..477).
   * If synthetic control point, tracksSourceLandmarkIndex is -1 and weights define its position.
   */
  landmarkIndex: number;
  // Blend/interpolation weights from parent landmarks if synthetic
  parentA?: number;
  parentB?: number;
  weightA?: number;
  // Region A (lip interior = 1.0), Region B (vermilion border = 0.5-0.7), Region C (transition skin = 0.0-0.3)
  region: 'A' | 'B' | 'C';
  regionWeight: number;
}

/**
 * Generates extra lip control points relative to neutral landmark positions
 * Targets ~100-200 extra points for fine, smooth lip deformation.
 */
export function generateLipControlPoints(
  neutralLandmarks: Point2D[],
  startId: number = 478
): { extraVertices: LipSubmeshVertex[]; borderEdges: [number, number][] } {
  const extraVertices: LipSubmeshVertex[] = [];
  const borderEdges: [number, number][] = [];
  let currentId = startId;

  // 1. Subdivide Upper Vermilion Outer Border
  const uOuter = LIP_LANDMARK_INDICES.upperOuter;
  for (let i = 0; i < uOuter.length - 1; i++) {
    const idx1 = uOuter[i];
    const idx2 = uOuter[i + 1];
    const p1 = neutralLandmarks[idx1];
    const p2 = neutralLandmarks[idx2];
    if (!p1 || !p2) continue;

    // Subdivide 2 points between consecutive vermilion border landmarks
    for (const t of [0.33, 0.67]) {
      extraVertices.push({
        id: currentId++,
        x: p1.x * (1 - t) + p2.x * t,
        y: p1.y * (1 - t) + p2.y * t,
        landmarkIndex: -1,
        parentA: idx1,
        parentB: idx2,
        weightA: 1 - t,
        region: 'B',
        regionWeight: 0.6,
      });
    }
  }

  // 2. Subdivide Lower Vermilion Outer Border
  const lOuter = LIP_LANDMARK_INDICES.lowerOuter;
  for (let i = 0; i < lOuter.length - 1; i++) {
    const idx1 = lOuter[i];
    const idx2 = lOuter[i + 1];
    const p1 = neutralLandmarks[idx1];
    const p2 = neutralLandmarks[idx2];
    if (!p1 || !p2) continue;

    for (const t of [0.33, 0.67]) {
      extraVertices.push({
        id: currentId++,
        x: p1.x * (1 - t) + p2.x * t,
        y: p1.y * (1 - t) + p2.y * t,
        landmarkIndex: -1,
        parentA: idx1,
        parentB: idx2,
        weightA: 1 - t,
        region: 'B',
        regionWeight: 0.6,
      });
    }
  }

  // 3. Grid of Interior Upper Lip points (Region A: weight = 1.0)
  const uInner = LIP_LANDMARK_INDICES.upperInner;
  const upperPairsCount = Math.min(uOuter.length, uInner.length);
  for (let i = 1; i < upperPairsCount - 1; i++) {
    const pOuter = neutralLandmarks[uOuter[i]];
    const pInner = neutralLandmarks[uInner[i]];
    if (!pOuter || !pInner) continue;

    for (const t of [0.3, 0.5, 0.7]) {
      extraVertices.push({
        id: currentId++,
        x: pOuter.x * (1 - t) + pInner.x * t,
        y: pOuter.y * (1 - t) + pInner.y * t,
        landmarkIndex: -1,
        parentA: uOuter[i],
        parentB: uInner[i],
        weightA: 1 - t,
        region: 'A',
        regionWeight: 1.0,
      });
    }
  }

  // 4. Grid of Interior Lower Lip points (Region A: weight = 1.0)
  const lInner = LIP_LANDMARK_INDICES.lowerInner;
  const lowerPairsCount = Math.min(lOuter.length, lInner.length);
  for (let i = 1; i < lowerPairsCount - 1; i++) {
    const pOuter = neutralLandmarks[lOuter[i]];
    const pInner = neutralLandmarks[lInner[i]];
    if (!pOuter || !pInner) continue;

    for (const t of [0.25, 0.5, 0.75]) {
      extraVertices.push({
        id: currentId++,
        x: pOuter.x * (1 - t) + pInner.x * t,
        y: pOuter.y * (1 - t) + pInner.y * t,
        landmarkIndex: -1,
        parentA: lOuter[i],
        parentB: lInner[i],
        weightA: 1 - t,
        region: 'A',
        regionWeight: 1.0,
      });
    }
  }

  // 5. Region C: Surrounding skin transition zone (weight tapers from 0.3 down to 0)
  // Upper skin boundary (towards philtrum and cheeks)
  for (let i = 0; i < uOuter.length; i++) {
    const idx = uOuter[i];
    const p = neutralLandmarks[idx];
    if (!p) continue;

    // Outward direction (upwards for upper lip)
    const dy = -0.015;
    for (const step of [1, 2]) {
      extraVertices.push({
        id: currentId++,
        x: p.x,
        y: p.y + dy * step,
        landmarkIndex: -1,
        parentA: idx,
        parentB: idx,
        weightA: 1.0,
        region: 'C',
        regionWeight: Math.max(0, 0.35 - step * 0.15),
      });
    }
  }

  // Lower skin boundary (towards chin)
  for (let i = 0; i < lOuter.length; i++) {
    const idx = lOuter[i];
    const p = neutralLandmarks[idx];
    if (!p) continue;

    // Outward direction (downwards for lower lip)
    const dy = 0.015;
    for (const step of [1, 2]) {
      extraVertices.push({
        id: currentId++,
        x: p.x,
        y: p.y + dy * step,
        landmarkIndex: -1,
        parentA: idx,
        parentB: idx,
        weightA: 1.0,
        region: 'C',
        regionWeight: Math.max(0, 0.35 - step * 0.15),
      });
    }
  }

  return { extraVertices, borderEdges };
}
