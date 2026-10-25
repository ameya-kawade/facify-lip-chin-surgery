import { Point2D } from '../tracking/landmarkSmoother';
import { CompleteMesh } from '../mesh/lipMeshBuilder';
import { CHIN_LANDMARK_INDICES } from '../mesh/chinControlPoints';

export interface ChinSliderParams {
  verticalLength: number;         // -15 to +15  (Shorten / Lengthen)
  projection: number;             // -15 to +15  (Frontal contour prominence)
  chinWidth: number;              // -15 to +15  (V-Line taper / Square)
  // ── Advanced clinic-grade controls ─────────────────────────────────────
  jawAngleWidth: number;          // -10 to +10  (Narrow gonial angle ↔ Widen)
  chinAsymmetryTilt: number;      // -10 to +10  (Tilt chin apex left ↔ right)
  prejowlCorrection: number;      // -10 to +10  (Fill pre-jowl sulcus depression)
}

export const DEFAULT_CHIN_SLIDERS: ChinSliderParams = {
  verticalLength: 0,
  projection: 0,
  chinWidth: 0,
  jawAngleWidth: 0,
  chinAsymmetryTilt: 0,
  prejowlCorrection: 0,
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
    sliders.chinWidth === 0 &&
    sliders.jawAngleWidth === 0 &&
    sliders.chinAsymmetryTilt === 0 &&
    sliders.prejowlCorrection === 0;

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
  const apexPt        = inputVertices[CHIN_LANDMARK_INDICES.apex] || { x: 0.5, y: 0.88 };
  const leftTubercle  = inputVertices[172] || inputVertices[148] || { x: 0.38, y: 0.82 };
  const rightTubercle = inputVertices[397] || inputVertices[377] || { x: 0.62, y: 0.82 };
  const mentolabialPt = inputVertices[18]  || { x: 0.5, y: 0.70 };

  // Approximate gonial angle landmarks (lateral jaw corners, mid-height)
  // MediaPipe: left gonion ≈ 172/136, right gonion ≈ 397/365
  const leftGonion  = inputVertices[172] || inputVertices[136] || { x: 0.30, y: 0.82 };
  const rightGonion = inputVertices[397] || inputVertices[365] || { x: 0.70, y: 0.82 };

  const chinCenterX   = apexPt.x;
  const chinHalfWidth = Math.max(0.02, Math.abs(rightTubercle.x - leftTubercle.x) / 2);
  const chinHeight    = Math.max(0.02, apexPt.y - mentolabialPt.y);
  const jawHalfWidth  = Math.max(0.02, Math.abs(rightGonion.x - leftGonion.x) / 2);

  // Calibrated displacements
  const MAX_VERT_DISP     = chinHeight * 0.18;
  const MAX_WIDTH_DISP    = chinHalfWidth * 0.16;
  const MAX_PROJ_DISP     = chinHeight * 0.10;
  const MAX_JAW_DISP      = jawHalfWidth * 0.15; // gonial angle lateral expansion
  const MAX_TILT_DISP     = chinHalfWidth * 0.12; // apex lateral offset
  const MAX_JOWL_DISP     = chinHeight * 0.08;    // pre-jowl vertical fill

  // Normalised inputs [-1..1]
  const rawVertical     = Math.max(-1, Math.min(1, sliders.verticalLength / 15));
  const rawWidth        = Math.max(-1, Math.min(1, sliders.chinWidth / 15));
  const rawProjection   = Math.max(-1, Math.min(1, sliders.projection / 15));
  const rawJawAngle     = Math.max(-1, Math.min(1, sliders.jawAngleWidth / 10));
  const rawTilt         = Math.max(-1, Math.min(1, sliders.chinAsymmetryTilt / 10));
  const rawJowl         = Math.max(-1, Math.min(1, sliders.prejowlCorrection / 10));

  const vertFactor    = rawVertical * MAX_VERT_DISP * effectScale;
  const widthFactor   = rawWidth * MAX_WIDTH_DISP * effectScale;
  const projFactor    = rawProjection * MAX_PROJ_DISP * effectScale;
  const jawFactor     = rawJawAngle * MAX_JAW_DISP * effectScale;
  const tiltFactor    = rawTilt * MAX_TILT_DISP * effectScale;
  const jowlFactor    = rawJowl * MAX_JOWL_DISP * effectScale;

  // Spatial cutoffs
  const mentolabialThresholdY = mentolabialPt.y;
  const chinBottomCutoffY     = apexPt.y + chinHeight * 0.6;
  const chinMaxRadiusX        = chinHalfWidth * 1.5;
  // Gonial angle region: upper half of chin height, wide lateral band
  const gonialUpperY          = mentolabialPt.y;
  const gonialLowerY          = apexPt.y;
  const gonialZoneRadiusX     = jawHalfWidth * 1.3;
  // Pre-jowl sulcus zone: a narrow band just lateral to the chin tubercles
  const jowlInnerX            = chinHalfWidth * 0.9;
  const jowlOuterX            = chinHalfWidth * 1.8;

  for (let i = 0; i < numVertices; i++) {
    const cur = inputVertices[i];
    if (!cur) {
      deformed[i] = { x: 0.5, y: 0.5 };
      continue;
    }

    const curX = cur.x;
    const curY = cur.y;

    // Strictly preserve everything at or above the mentolabial groove
    if (curY <= mentolabialThresholdY) {
      deformed[i] = { x: curX, y: curY };
      continue;
    }

    let dx = 0;
    let dy = 0;

    const distFromCenterX = Math.abs(curX - chinCenterX);
    const normY = Math.min(1.0, Math.max(0.0, (curY - mentolabialThresholdY) / chinHeight));
    const normX = Math.min(1.0, distFromCenterX / chinHalfWidth);

    // Smoothstep: 0 at fold, ~1 at apex
    const verticalWeight   = normY * normY * (3 - 2 * normY);
    const lateralWeight    = Math.min(1.0, normX) * verticalWeight;
    const horizontalFalloff = Math.cos(normX * (Math.PI / 2));

    // ── 1. Vertical Length ─────────────────────────────────────────────
    if (vertFactor !== 0 && distFromCenterX <= chinMaxRadiusX && curY <= chinBottomCutoffY) {
      dy += vertFactor * verticalWeight * horizontalFalloff;
    }

    // ── 2. Chin Width / V-Line ─────────────────────────────────────────
    if (widthFactor !== 0 && distFromCenterX <= chinMaxRadiusX && curY <= chinBottomCutoffY) {
      const relX = (curX - chinCenterX) / chinHalfWidth;
      dx += relX * widthFactor * lateralWeight;
    }

    // ── 3. Frontal Contour Prominence ──────────────────────────────────
    if (projFactor !== 0 && distFromCenterX <= chinMaxRadiusX && curY <= chinBottomCutoffY) {
      dy += projFactor * 0.4 * verticalWeight * horizontalFalloff;
    }

    // ── 4. Jaw Angle Width (gonial region) ────────────────────────────
    // Affects the lateral jaw in the mid-lower face; widening pushes the gonion laterally,
    // narrowing reduces the apparent jaw width without touching the chin apex.
    if (jawFactor !== 0 && distFromCenterX >= chinHalfWidth * 0.8 && distFromCenterX <= gonialZoneRadiusX
        && curY >= gonialUpperY && curY <= gonialLowerY) {
      const jawNormX = (distFromCenterX - chinHalfWidth * 0.8) / (gonialZoneRadiusX - chinHalfWidth * 0.8);
      const jawNormY = (curY - gonialUpperY) / (gonialLowerY - gonialUpperY);
      // Weight peaks at lateral gonion and mid-height
      const jawWeight = Math.sin(jawNormX * Math.PI) * Math.sin(jawNormY * Math.PI);
      const signX = curX >= chinCenterX ? 1 : -1;
      dx += signX * jawFactor * jawWeight;
    }

    // ── 5. Chin Asymmetry / Tilt ──────────────────────────────────────
    // Laterally shifts the chin apex region. Positive → apex moves right,
    // negative → apex moves left. Falls off rapidly away from apex.
    if (tiltFactor !== 0 && distFromCenterX <= chinHalfWidth * 1.2 && curY <= chinBottomCutoffY) {
      // Peak influence at chin apex (normY = 1), fades toward fold (normY = 0)
      const apexWeight = normY * normY;
      const lateralFalloff = Math.max(0, 1.0 - normX);
      dx += tiltFactor * apexWeight * lateralFalloff;
    }

    // ── 6. Pre-Jowl Sulcus Correction ────────────────────────────────
    // Fills the depression lateral to the chin tubercles where soft tissue sags.
    // Positive → adds volume (pushes vertices slightly down/outward to fill hollow).
    // Affects a narrow lateral zone between jowlInnerX and jowlOuterX.
    if (jowlFactor !== 0) {
      const jowlInZone = distFromCenterX >= jowlInnerX && distFromCenterX <= jowlOuterX
        && curY >= mentolabialThresholdY && curY <= gonialLowerY;
      if (jowlInZone) {
        const jowlNormX = (distFromCenterX - jowlInnerX) / (jowlOuterX - jowlInnerX);
        const jowlNormY = (curY - mentolabialThresholdY) / (gonialLowerY - mentolabialThresholdY);
        const jowlWeight = Math.sin(jowlNormX * Math.PI) * Math.sin(jowlNormY * Math.PI);
        // Correction: push the hollow region slightly downward-outward to fill it
        const signX = curX >= chinCenterX ? 1 : -1;
        dx += signX * jowlFactor * jowlWeight * 0.5;
        dy += jowlFactor * jowlWeight;
      }
    }

    deformed[i] = {
      x: curX + dx,
      y: curY + dy,
    };
  }

  return deformed;
}
