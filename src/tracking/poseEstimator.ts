export interface PoseEstimate {
  isFrontal: boolean;
  yaw: number;   // approximate degrees (rotation around Y)
  pitch: number; // approximate degrees (rotation around X)
  roll: number;  // approximate degrees (rotation around Z)
  score: number; // 0 to 1 frontal confidence
}

/**
 * Derives approximate yaw, pitch, roll from MediaPipe facial transformation matrix
 * or facial landmarks geometry.
 */
export function estimatePoseFromMatrix(matrix?: number[] | Float32Array): PoseEstimate {
  if (!matrix || matrix.length < 16) {
    return { isFrontal: true, yaw: 0, pitch: 0, roll: 0, score: 1.0 };
  }

  const r02 = matrix[2];
  const r10 = matrix[4], r11 = matrix[5], r12 = matrix[6];
  const r22 = matrix[10];

  // Euler angles in degrees
  const pitch = Math.atan2(-r12, r22) * (180 / Math.PI);
  const yaw = Math.atan2(r02, Math.sqrt(r12 * r12 + r22 * r22)) * (180 / Math.PI);
  const roll = Math.atan2(-r10, r11) * (180 / Math.PI);

  const yawAbs = Math.abs(yaw);
  const pitchAbs = Math.abs(pitch);

  // Frontal threshold: yaw < 25 deg, pitch < 20 deg
  const isFrontal = yawAbs < 25 && pitchAbs < 20;

  // Frontal confidence score from 1.0 down to 0.0
  const maxAngle = Math.max(yawAbs / 25, pitchAbs / 20);
  const score = Math.max(0, Math.min(1, 1 - maxAngle));

  return { isFrontal, yaw, pitch, roll, score };
}
