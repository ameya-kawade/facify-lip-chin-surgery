import { LIP_LANDMARK_INDICES } from './lipControlPoints';

export interface VertexWeight {
  vertexIndex: number;
  region: 'A' | 'B' | 'C' | 'OUTSIDE';
  // 1.0 for lip interior, 0.6 for vermilion border, 0.1-0.3 for skin transition, 0 for outside
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
 * Returns default deformation weights for canonical landmarks
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

  // Vermilion borders
  if (UPPER_OUTER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'B',
      fullnessWeight: 0.7,
      widthWeight: 0.7,
      isUpperLip: true,
      isLowerLip: false,
      isMouthCorner: false,
    };
  }

  if (LOWER_OUTER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'B',
      fullnessWeight: 0.7,
      widthWeight: 0.7,
      isUpperLip: false,
      isLowerLip: true,
      isMouthCorner: false,
    };
  }

  // Inner boundaries
  if (UPPER_INNER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'A',
      fullnessWeight: 0.9,
      widthWeight: 0.8,
      isUpperLip: true,
      isLowerLip: false,
      isMouthCorner: false,
    };
  }

  if (LOWER_INNER_SET.has(index)) {
    return {
      vertexIndex: index,
      region: 'A',
      fullnessWeight: 0.9,
      widthWeight: 0.8,
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
