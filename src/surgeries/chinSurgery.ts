import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from '../mesh/lipMeshBuilder';
import { CHIN_LANDMARK_INDICES } from '../mesh/chinControlPoints';

export interface ChinSliderParams {
  verticalLength: number; // -15 to +15 (Shorten / Lengthen)
  projection: number;     // -15 to +15 (Frontal contour prominence approx.)
  chinWidth: number;      // -15 to +15 (V-Line taper / Square)
}

export const DEFAULT_CHIN_SLIDERS: ChinSliderParams = {
  verticalLength: 0,
  projection: 0,
  chinWidth: 0,
};

/**
 * Computes deformed positions for mesh vertices based on chin surgery parameters.
 * Uses a continuous spatial influence field below the mentolabial fold,
 * ensuring all local mesh triangles deform smoothly without stretching isolated vertices.
 * Strictly preserves the mentolabial fold (landmarks 17, 18, 83, 313) and lower lip vermilion.
 *
 * @param inputVertices Current resolved mesh vertices (e.g. output from deformLipMesh)
 * @param baseMesh The CompleteMesh containing topology and weights
 * @param sliders Slider parameter values
 * @param headAngleConfidence Pose and jaw gating factor [0..1]
 */
export function deformChinMesh(
  inputVertices: Point2D[],
  baseMesh: CompleteMesh,
  sliders: ChinSliderParams,
  headAngleConfidence: number = 1.0
): Point2D[] {
  const numVertices = baseMesh.vertices.length;

  // Identity fast-path if all sliders are 0
  const isZero =
    sliders.verticalLength === 0 &&
    sliders.projection === 0 &&
    sliders.chinWidth === 0;

  if (isZero) {
    if (inputVertices.length >= numVertices) {
      return inputVertices.slice(0, numVertices);
    }
    const padded = new Array(numVertices);
    for (let i = 0; i < numVertices; i++) {
      padded[i] = inputVertices[i] || baseMesh.vertices[i];
    }
    return padded;
  }

  const deformed: Point2D[] = new Array(numVertices);
  const effectScale = Math.max(0, Math.min(1, headAngleConfidence));

  // Key chin reference anchors
  const apexPt       = inputVertices[CHIN_LANDMARK_INDICES.apex] || { x: 0.5, y: 0.88 };
  const leftTubercle = inputVertices[172] || inputVertices[148] || { x: 0.38, y: 0.82 };
  const rightTubercle= inputVertices[397] || inputVertices[377] || { x: 0.62, y: 0.82 };
  const mentolabialPt= inputVertices[18] || { x: 0.5, y: 0.70 };

  const chinCenterX = apexPt.x;
  const chinHalfWidth = Math.max(0.02, Math.abs(rightTubercle.x - leftTubercle.x) / 2);
  const chinHeight = Math.max(0.02, apexPt.y - mentolabialPt.y);

  // Calibrate displacement against chin scale
  const MAX_VERT_DISP  = chinHeight * 0.18; // ~18% of chin height
  const MAX_WIDTH_DISP = chinHalfWidth * 0.16; // ~16% of chin half-width
  const MAX_PROJ_DISP  = chinHeight * 0.10; // ~10% frontal contour expansion

  // Linear clamped inputs in [-1, 1]
  const rawVertical   = Math.max(-1, Math.min(1, sliders.verticalLength / 15));
  const rawWidth      = Math.max(-1, Math.min(1, sliders.chinWidth / 15));
  const rawProjection = Math.max(-1, Math.min(1, sliders.projection / 15));

  const vertFactor  = rawVertical * MAX_VERT_DISP * effectScale;
  const widthFactor = rawWidth * MAX_WIDTH_DISP * effectScale;
  const projFactor  = rawProjection * MAX_PROJ_DISP * effectScale;

  // Mentolabial fold Y acts as upper cutoff anchor plane
  const mentolabialThresholdY = mentolabialPt.y;
  const chinBottomCutoffY = apexPt.y + chinHeight * 0.6;
  const chinMaxRadiusX = chinHalfWidth * 1.5;

  for (let i = 0; i < numVertices; i++) {
    const cur = inputVertices[i];
    if (!cur) {
      deformed[i] = { x: 0.5, y: 0.5 };
      continue;
    }

    const curX = cur.x;
    const curY = cur.y;

    // Safety rule: strictly preserve everything at or above the mentolabial groove
    // and protect upper face and lips completely
    if (curY <= mentolabialThresholdY) {
      deformed[i] = { x: curX, y: curY };
      continue;
    }

    // Check if within chin horizontal bounds
    const distFromCenterX = Math.abs(curX - chinCenterX);
    if (distFromCenterX > chinMaxRadiusX || curY > chinBottomCutoffY) {
      deformed[i] = { x: curX, y: curY };
      continue;
    }

    // Continuous normalized vertical coordinate below mentolabial fold: [0 at fold, 1 at apex]
    const normY = Math.min(1.0, Math.max(0.0, (curY - mentolabialThresholdY) / chinHeight));
    // Continuous normalized horizontal coordinate: [0 at center, 1 at lateral edge]
    const normX = Math.min(1.0, distFromCenterX / chinHalfWidth);

    // Smoothstep falloff from mentolabial fold down to apex
    // 0 at fold (preserving lip transition), smoothly increasing towards chin apex
    const verticalWeight = normY * normY * (3 - 2 * normY);

    // Lateral contour weight: higher at lateral tubercles, smooth taper at midline and outside
    const lateralWeight = Math.min(1.0, normX) * verticalWeight;

    // Horizontal falloff from center outwards
    const horizontalFalloff = Math.cos(normX * (Math.PI / 2));

    let dx = 0;
    let dy = 0;

    // 1. Vertical Length (Gnathion / Menton lengthening or shortening)
    if (vertFactor !== 0) {
      dy += vertFactor * verticalWeight * horizontalFalloff;
    }

    // 2. Chin Width / V-Line (symmetric lateral contour reshaping)
    if (widthFactor !== 0) {
      const relX = (curX - chinCenterX) / chinHalfWidth;
      dx += relX * widthFactor * lateralWeight;
    }

    // 3. Frontal contour prominence (approximate 2D sagittal fullness)
    if (projFactor !== 0) {
      dy += projFactor * 0.4 * verticalWeight * horizontalFalloff;
    }

    deformed[i] = {
      x: curX + dx,
      y: curY + dy,
    };
  }

  return deformed;
}
