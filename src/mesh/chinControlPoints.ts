export interface ChinLandmarks {
  apex: number;             // Gnathion/Menton lowest point: 152
  pogonion: number[];       // Most anterior protrusion: 199, 175, 200
  lowerBorder: number[];    // Inferior contour: 148, 176, 152, 377, 400
  lateralTubercles: {
    left: number[];         // 148, 149, 150, 176, 172, 136
    right: number[];        // 377, 378, 379, 400, 365, 397
  };
  mentolabialFold: number[];// Crucial anchor (zero vertical displacement): 17, 18, 83, 313
  softTissueBoundary: number[]; // Transition to cheeks/neck: 201, 208, 171, 140, 421, 428, 396, 369, 58, 132, 288, 361
}

export const CHIN_LANDMARK_INDICES: ChinLandmarks = {
  apex: 152,
  pogonion: [199, 175, 200],
  lowerBorder: [148, 176, 152, 377, 400],
  lateralTubercles: {
    left: [148, 149, 150, 176, 172, 136],
    right: [377, 378, 379, 400, 365, 397],
  },
  mentolabialFold: [17, 18, 83, 313],
  softTissueBoundary: [
    201, 208, 171, 140, 421, 428, 396, 369,
    58, 132, 288, 361,
  ],
};

export interface ChinVertexWeight {
  vertexIndex: number;
  verticalWeight: number;   // 0.0 to 1.0 (highest at apex 152, 0 at mentolabial fold)
  widthWeight: number;      // 0.0 to 1.0 (highest at lateral tubercles, lower at midline)
  projectionWeight: number; // 0.0 to 1.0 (highest at pogonion 199, 175)
  isAnchor: boolean;        // true if strictly stationary (e.g. mentolabial fold, upper face)
}

export const ALL_CHIN_LANDMARK_INDICES = new Set([
  CHIN_LANDMARK_INDICES.apex,
  ...CHIN_LANDMARK_INDICES.pogonion,
  ...CHIN_LANDMARK_INDICES.lowerBorder,
  ...CHIN_LANDMARK_INDICES.lateralTubercles.left,
  ...CHIN_LANDMARK_INDICES.lateralTubercles.right,
  ...CHIN_LANDMARK_INDICES.mentolabialFold,
  ...CHIN_LANDMARK_INDICES.softTissueBoundary,
]);

/**
 * Computes deformation weights for a landmark index.
 */
export function getChinLandmarkWeight(landmarkIndex: number): ChinVertexWeight {
  // Anchors: mentolabial fold must NEVER move vertically to preserve lower lip
  if (CHIN_LANDMARK_INDICES.mentolabialFold.includes(landmarkIndex)) {
    return {
      vertexIndex: landmarkIndex,
      verticalWeight: 0.0,
      widthWeight: 0.0,
      projectionWeight: 0.0,
      isAnchor: true,
    };
  }

  // Chin apex (152): maximum vertical displacement
  if (landmarkIndex === CHIN_LANDMARK_INDICES.apex) {
    return {
      vertexIndex: landmarkIndex,
      verticalWeight: 1.0,
      widthWeight: 0.1,
      projectionWeight: 0.8,
      isAnchor: false,
    };
  }

  // Pogonion: maximum projection
  if (CHIN_LANDMARK_INDICES.pogonion.includes(landmarkIndex)) {
    const isMainApex = landmarkIndex === 199;
    return {
      vertexIndex: landmarkIndex,
      verticalWeight: isMainApex ? 0.75 : 0.6,
      widthWeight: 0.2,
      projectionWeight: 1.0,
      isAnchor: false,
    };
  }

  // Lower contour borders (148, 176, 377, 400)
  if (CHIN_LANDMARK_INDICES.lowerBorder.includes(landmarkIndex)) {
    return {
      vertexIndex: landmarkIndex,
      verticalWeight: 0.85,
      widthWeight: 0.8,
      projectionWeight: 0.5,
      isAnchor: false,
    };
  }

  // Lateral tubercles (left & right)
  if (
    CHIN_LANDMARK_INDICES.lateralTubercles.left.includes(landmarkIndex) ||
    CHIN_LANDMARK_INDICES.lateralTubercles.right.includes(landmarkIndex)
  ) {
    return {
      vertexIndex: landmarkIndex,
      verticalWeight: 0.5,
      widthWeight: 1.0,
      projectionWeight: 0.3,
      isAnchor: false,
    };
  }

  // Soft tissue boundary
  if (CHIN_LANDMARK_INDICES.softTissueBoundary.includes(landmarkIndex)) {
    return {
      vertexIndex: landmarkIndex,
      verticalWeight: 0.2,
      widthWeight: 0.4,
      projectionWeight: 0.1,
      isAnchor: false,
    };
  }

  // Outside chin region
  return {
    vertexIndex: landmarkIndex,
    verticalWeight: 0.0,
    widthWeight: 0.0,
    projectionWeight: 0.0,
    isAnchor: true,
  };
}
