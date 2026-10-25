import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { Point2D } from './landmarkSmoother';

export interface TrackingResult {
  landmarks: Point2D[];
  rawResult: FaceLandmarkerResult | null;
  confidence: number;
  matrix?: number[];
  jawOpen: number;
}

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private isInitializing: boolean = false;
  private lastResult: TrackingResult = {
    landmarks: [],
    rawResult: null,
    confidence: 0,
    jawOpen: 0,
  };

  async initialize(): Promise<FaceLandmarker> {
    if (this.landmarker) return this.landmarker;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (this.landmarker) return this.landmarker;
    }

    this.isInitializing = true;
    try {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
      const wasmPath = `${baseUrl}wasm`;
      const modelPath = `${baseUrl}models/face_landmarker.task`;

      const fileset = await FilesetResolver.forVisionTasks(wasmPath);

      try {
        // Try GPU delegate first as per plan
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      } catch (gpuError) {
        console.warn('FaceTracker: GPU delegate failed, falling back to CPU:', gpuError);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      }

      return this.landmarker;
    } finally {
      this.isInitializing = false;
    }
  }

  detectForVideo(video: HTMLVideoElement, timestampMs: number): TrackingResult {
    if (!this.landmarker || video.readyState < 2) {
      return this.lastResult;
    }

    try {
      const result = this.landmarker.detectForVideo(video, timestampMs);
      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const rawLandmarks = result.faceLandmarks[0];
        const matrixData = result.facialTransformationMatrixes?.[0]?.data;
        const matrix = matrixData ? Array.from(matrixData) : undefined;

        const blendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
        const jawOpen = blendshapes.find(b => b.categoryName === 'jawOpen')?.score ?? 0;

        this.lastResult = {
          landmarks: rawLandmarks.map(p => ({ x: p.x, y: p.y, z: p.z })),
          rawResult: result,
          confidence: 0.95, // detected with high face confidence
          matrix,
          jawOpen,
        };
      } else {
        this.lastResult = {
          landmarks: [],
          rawResult: result,
          confidence: 0,
          jawOpen: 0,
        };
      }
    } catch (err) {
      console.warn('FaceTracker detection error:', err);
      // Invalidate detection on exception to prevent stale geometry warps
      this.lastResult = {
        landmarks: [],
        rawResult: null,
        confidence: 0,
        jawOpen: 0,
      };
    }

    return this.lastResult;
  }

  getLatestResult(): TrackingResult {
    return this.lastResult;
  }

  close(): void {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
