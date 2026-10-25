import poly2tri from 'poly2tri';
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

const LIP_REGION_CANONICAL_INDICES = new Set([
  ...LIP_LANDMARK_INDICES.upperOuter,
  ...LIP_LANDMARK_INDICES.lowerOuter,
  ...LIP_LANDMARK_INDICES.upperInner,
  ...LIP_LANDMARK_INDICES.lowerInner,
  0, 11, 12, 13, 14, 15, 16, 17, 18, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95,
  146, 164, 178, 181, 185, 191, 267, 269, 270, 291, 308, 310, 311, 312, 314, 317, 318,
  321, 324, 375, 402, 405, 409, 415,
]);

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

  const canonicalNonLipTriangles: [number, number, number][] = [];
  const canonicalLipTriangles: [number, number, number][] = [];

  for (const tri of CANONICAL_TRIANGLES) {
    const [a, b, c] = tri;
    const isLipTri = LIP_REGION_CANONICAL_INDICES.has(a) &&
                     LIP_REGION_CANONICAL_INDICES.has(b) &&
                     LIP_REGION_CANONICAL_INDICES.has(c);
    if (isLipTri) {
      canonicalLipTriangles.push([a, b, c]);
    } else {
      canonicalNonLipTriangles.push([a, b, c]);
    }
  }

  const refinedLipTriangles: [number, number, number][] = [];

  const lipVerticesToTriangulate = allVertices.filter(v =>
    LIP_REGION_CANONICAL_INDICES.has(v.id) || v.landmarkIndex === -1
  );

  const midY = neutralLandmarks[13] ? (neutralLandmarks[13].y + neutralLandmarks[14].y) / 2 : 0.5;
  const upperLipVerts = lipVerticesToTriangulate.filter(v => v.y <= midY + 0.005);
  const lowerLipVerts = lipVerticesToTriangulate.filter(v => v.y >= midY - 0.005);

  function triangulatePoints(verts: LipSubmeshVertex[]) {
    if (verts.length < 3) return;
    const p2tPoints: (poly2tri.Point & { customId: number })[] = [];
    const seen = new Set<string>();

    for (const v of verts) {
      const key = `${Math.round(v.x * 10000)},${Math.round(v.y * 10000)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const p = new poly2tri.Point(v.x, v.y) as (poly2tri.Point & { customId: number });
      p.customId = v.id;
      p2tPoints.push(p);
    }

    if (p2tPoints.length < 3) return;

    try {
      const minX = Math.min(...p2tPoints.map(p => p.x)) - 0.002;
      const maxX = Math.max(...p2tPoints.map(p => p.x)) + 0.002;
      const minY = Math.min(...p2tPoints.map(p => p.y)) - 0.002;
      const maxY = Math.max(...p2tPoints.map(p => p.y)) + 0.002;

      const polyline = [
        new poly2tri.Point(minX, minY),
        new poly2tri.Point(maxX, minY),
        new poly2tri.Point(maxX, maxY),
        new poly2tri.Point(minX, maxY),
      ];

      const swctx = new poly2tri.SweepContext(polyline);
      for (const pt of p2tPoints) {
        swctx.addPoint(pt);
      }
      swctx.triangulate();

      const tris = swctx.getTriangles();
      for (const t of tris) {
        const pts = t.getPoints() as unknown as { customId?: number }[];
        if (pts[0]?.customId !== undefined && pts[1]?.customId !== undefined && pts[2]?.customId !== undefined) {
          refinedLipTriangles.push([pts[0].customId, pts[1].customId, pts[2].customId]);
        }
      }
    } catch {
      // Fallback
    }
  }

  triangulatePoints(upperLipVerts);
  triangulatePoints(lowerLipVerts);

  const activeLipTriangles = refinedLipTriangles.length > 20 ? refinedLipTriangles : canonicalLipTriangles;

  const combinedTriangles: [number, number, number][] = [
    ...canonicalNonLipTriangles,
    ...activeLipTriangles,
  ];

  const lipTriangleStartIndex = canonicalNonLipTriangles.length;
  const lipTriangleIndices = Array.from(
    { length: activeLipTriangles.length },
    (_, i) => lipTriangleStartIndex + i
  );

  const chinTriangleIndices: number[] = [];
  for (let i = 0; i < combinedTriangles.length; i++) {
    const tri = combinedTriangles[i];
    if (tri.some(idx => ALL_CHIN_LANDMARK_INDICES.has(idx))) {
      chinTriangleIndices.push(i);
    }
  }

  const allActiveTriangleIndices = Array.from(
    new Set([...lipTriangleIndices, ...chinTriangleIndices])
  );

  return {
    vertices: allVertices,
    triangles: combinedTriangles,
    lipTriangleIndices,
    chinTriangleIndices,
    allActiveTriangleIndices,
    weights,
  };
}
