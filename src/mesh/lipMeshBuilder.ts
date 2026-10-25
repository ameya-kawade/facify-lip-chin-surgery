import { Point2D } from '../tracking/landmarkSmoother';
import { CANONICAL_TRIANGLES } from './canonicalTriangulation';
import { LIP_LANDMARK_INDICES, generateLipControlPoints, LipSubmeshVertex } from './lipControlPoints';
import { VertexWeight, getCanonicalLandmarkWeight } from './deformationWeights';
import { ALL_CHIN_LANDMARK_INDICES } from './chinControlPoints';

export interface CompleteMesh {
  vertices: LipSubmeshVertex[];
  triangles: [number, number, number][];
  lipTriangleIndices: number[];
  chinTriangleIndices: number[];
  allActiveTriangleIndices: number[];
  weights: VertexWeight[];
}

export const LIP_REGION_CANONICAL_INDICES = new Set([
  ...LIP_LANDMARK_INDICES.upperOuter,
  ...LIP_LANDMARK_INDICES.lowerOuter,
  ...LIP_LANDMARK_INDICES.upperInner,
  ...LIP_LANDMARK_INDICES.lowerInner,
  0, 11, 12, 13, 14, 15, 16, 17, 18, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95,
  146, 164, 178, 181, 185, 191, 267, 269, 270, 291, 308, 310, 311, 312, 314, 317, 318,
  321, 324, 375, 402, 405, 409, 415,
]);

/**
 * Builds the complete face mesh using verified canonical triangulation for stability.
 * Incorporates canonical landmarks and synthetic control points into mesh.vertices,
 * while using canonical anatomical triangles for guaranteed topological coherence.
 */
export function buildLipMesh(neutralLandmarks: Point2D[]): CompleteMesh {
  const allVertices: LipSubmeshVertex[] = [];
  const weights: VertexWeight[] = [];

  for (let i = 0; i < neutralLandmarks.length; i++) {
    const p = neutralLandmarks[i] || { x: 0.5, y: 0.5, z: 0 };
    const w = getCanonicalLandmarkWeight(i);
    allVertices.push({
      id: i,
      x: p.x,
      y: p.y,
      landmarkIndex: i,
      region: w.region === 'OUTSIDE' ? 'C' : w.region,
      regionWeight: w.fullnessWeight,
    });
    weights.push(w);
  }

  // Generate synthetic control points for fine interpolation
  const { extraVertices } = generateLipControlPoints(neutralLandmarks, allVertices.length);
  for (const ev of extraVertices) {
    allVertices.push(ev);
    const isUpper = ev.y < (neutralLandmarks[13]?.y ?? 0.5);
    weights.push({
      vertexIndex: ev.id,
      region: ev.region,
      fullnessWeight: ev.regionWeight,
      widthWeight: ev.region === 'C' ? 0.2 : 0.7,
      isUpperLip: isUpper,
      isLowerLip: !isUpper,
      isMouthCorner: false,
    });
  }

  // Use clean canonical triangulation (Fix B: safe fallback per repair plan)
  // This eliminates poly2tri's bounding box and guarantees non-crossing, valid geometry
  const combinedTriangles: [number, number, number][] = CANONICAL_TRIANGLES.map(
    t => [t[0], t[1], t[2]] as [number, number, number]
  );

  const lipTriangleIndices: number[] = [];
  const chinTriangleIndices: number[] = [];

  for (let i = 0; i < combinedTriangles.length; i++) {
    const [a, b, c] = combinedTriangles[i];
    const isLip =
      LIP_REGION_CANONICAL_INDICES.has(a) ||
      LIP_REGION_CANONICAL_INDICES.has(b) ||
      LIP_REGION_CANONICAL_INDICES.has(c);

    if (isLip) {
      lipTriangleIndices.push(i);
    }

    const isChin =
      ALL_CHIN_LANDMARK_INDICES.has(a) ||
      ALL_CHIN_LANDMARK_INDICES.has(b) ||
      ALL_CHIN_LANDMARK_INDICES.has(c);

    if (isChin) {
      chinTriangleIndices.push(i);
    }
  }

  const allActiveTriangleIndices = Array.from(
    new Set([...lipTriangleIndices, ...chinTriangleIndices])
  );

  // P2 diagnostic: log active triangle counts once so we know we're NOT on the silent fallback
  // Check for the global flag to avoid spamming on every face frame
  if (!(globalThis as Record<string, unknown>)['_facifyMeshLogged']) {
    (globalThis as Record<string, unknown>)['_facifyMeshLogged'] = true;
    console.info(
      '[facify/mesh] canonical triangulation active:',
      combinedTriangles.length, 'total |',
      lipTriangleIndices.length, 'lip |',
      chinTriangleIndices.length, 'chin triangles'
    );
  }

  return {
    vertices: allVertices,
    triangles: combinedTriangles,
    lipTriangleIndices,
    chinTriangleIndices,
    allActiveTriangleIndices,
    weights,
  };
}
