import { LIP_LANDMARK_INDICES } from './lipControlPoints';

export interface VertexWeight {
  vertexIndex: number;
  region: 'A' | 'B' | 'C' | 'OUTSIDE';
  // 1.0 for vermilion outer contour, 0.15 for inner boundary (teeth side), 0 for outside
  fullnessWeight: number;
  widthWeight: number;
  isUpperLip: boolean;
  isLowerLip: boolean;
  isMouthCorner: boolean;
}

const UPPER_INNER_SET = new Set(LIP_LANDMARK_INDICES.upperInner);
const LOWER_INNER_SET = new Set(LIP_LANDMARK_INDICES.lowerInner);
const UPPER_OUTER_SET = new Set(LIP_LANDMARK_INDICES.upperOuter);
const LOWER_OUTER_SET = new Set(LIP_LANDMARK_INDICES.lowerOuter);
const CORNERS_SET = new Set([LIP_LANDMARK_INDICES.leftCorner, LIP_LANDMARK_INDICES.rightCorner]);

/**
 * Returns deformation weights for canonical landmarks.
 *
 * P0 FIX — Weight hierarchy corrected so vermilion widening (plumping) is visible:
 *   • Outer vermilion contour  → fullnessWeight 1.0  (was 0.7) — carries the visible silhouette change
 *   • Inner lip boundary       → fullnessWeight 0.15 (was 0.9) — nearly anchored (teeth side)
 *   • Mouth corners            → fullnessWeight 0.0  (unchanged) — absolute anchors
 *
 * With the old values (inner 0.9 > outer 0.7) the entire band translated upward and the mouth
 * opening closed slightly; the vermilion silhouette barely moved. Flipping the hierarchy means
 * the outer contour now travels ~6-7× further than the inner boundary, which reads as the lip
 * visibly plumping / widening.
 */
export function getCanonicalLandmarkWeight(index: number): VertexWeight {
  if (CORNERS_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'B',
      fullnessWeight: 0.0, // Mouth corners are ANCHORS: never move on fullness
      widthWeight: 1.0,    // Mouth corners move horizontally on width
      isUpperLip: false,
      isLowerLip: false,
      isMouthCorner: true,
    };
  }

  // ── Vermilion outer contour (the visible lip silhouette) ──────────────────
  // These must move the MOST so the plumping reads clearly against the skin.
  if (UPPER_OUTER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'B',
      fullnessWeight: 1.0,  // ← was 0.7 — now the primary carrier of the effect
      widthWeight: 0.8,
      isUpperLip: true,
      isLowerLip: false,
      isMouthCorner: false,
    };
  }

  if (LOWER_OUTER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'B',
      fullnessWeight: 1.0,  // ← was 0.7
      widthWeight: 0.8,
      isUpperLip: false,
      isLowerLip: true,
      isMouthCorner: false,
    };
  }

  // ── Inner lip boundary (teeth side) ──────────────────────────────────────
  // These must be nearly anchored. Moving them in the same direction as the outer
  // contour translates the band rather than dilating it.
  if (UPPER_INNER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'A',
      fullnessWeight: 0.15, // ← was 0.9 — now nearly stationary (teeth-side anchor)
      widthWeight: 0.5,
      isUpperLip: true,
      isLowerLip: false,
      isMouthCorner: false,
    };
  }

  if (LOWER_INNER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'A',
      fullnessWeight: 0.15, // ← was 0.9
      widthWeight: 0.5,
      isUpperLip: false,
      isLowerLip: true,
      isMouthCorner: false,
    };
  }

  return {
    vertexIndex: index,
    region: 'OUTSIDE',
    fullnessWeight: 0.0,
    widthWeight: 0.0,
    isUpperLip: false,
    isLowerLip: false,
    isMouthCorner: false,
  };
}
