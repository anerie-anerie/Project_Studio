// ==========================================
// 3D VECTOR & GEOMETRY HELPERS
// ==========================================

export type Point3D = {
    x: number;
    y: number;
    z: number;
  };
  
  export function subtractVectors(pointA: Point3D, pointB: Point3D): Point3D {
    return {
      x: pointA.x - pointB.x,
      y: pointA.y - pointB.y,
      z: pointA.z - pointB.z,
    };
  }
  
  export function vectorLength(vector: Point3D): number {
    return Math.hypot(vector.x, vector.y, vector.z);
  }
  
  export function normalizeVector(vector: Point3D): Point3D | null {
    const length = vectorLength(vector);
    if (length < 0.000001) return null;
    return {
      x: vector.x / length,
      y: vector.y / length,
      z: vector.z / length,
    };
  }
  
  export function dotProduct(vectorA: Point3D, vectorB: Point3D): number {
    return vectorA.x * vectorB.x + vectorA.y * vectorB.y + vectorA.z * vectorB.z;
  }
  
  export function crossProduct(vectorA: Point3D, vectorB: Point3D): Point3D {
    return {
      x: vectorA.y * vectorB.z - vectorA.z * vectorB.y,
      y: vectorA.z * vectorB.x - vectorA.x * vectorB.z,
      z: vectorA.x * vectorB.y - vectorA.y * vectorB.x,
    };
  }
  
  export function calculateMidpoint(pointA: Point3D, pointB: Point3D): Point3D {
    return {
      x: (pointA.x + pointB.x) / 2,
      y: (pointA.y + pointB.y) / 2,
      z: (pointA.z + pointB.z) / 2,
    };
  }
  
  export function calculateShoulderAngle(
    hip: Point3D,
    shoulder: Point3D,
    elbow: Point3D
  ): number | null {
    const torsoVector = subtractVectors(hip, shoulder);
    const upperArmVector = subtractVectors(elbow, shoulder);
  
    const torsoLength = vectorLength(torsoVector);
    const upperArmLength = vectorLength(upperArmVector);
  
    if (torsoLength < 0.000001 || upperArmLength < 0.000001) {
      return null;
    }
  
    const cosine = dotProduct(torsoVector, upperArmVector) / (torsoLength * upperArmLength);
    const safeCosine = Math.max(-1, Math.min(1, cosine));
  
    return Math.acos(safeCosine) * (180 / Math.PI);
  }
  
  export function calculateTorsoForwardDirection(pose: Point3D[]): Point3D | null {
    const leftShoulder = pose[11];
    const rightShoulder = pose[12];
    const leftHip = pose[23];
    const rightHip = pose[24];
  
    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;
  
    const shoulderDirection = normalizeVector(subtractVectors(leftShoulder, rightShoulder));
    const shoulderCenter = calculateMidpoint(leftShoulder, rightShoulder);
    const hipCenter = calculateMidpoint(leftHip, rightHip);
    const torsoUpDirection = normalizeVector(subtractVectors(shoulderCenter, hipCenter));
  
    if (!shoulderDirection || !torsoUpDirection) return null;
  
    const forwardVector = crossProduct(shoulderDirection, torsoUpDirection);
    return normalizeVector(forwardVector);
  }
  
  export function calculateArmForwardScore(
    shoulder: Point3D,
    elbow: Point3D,
    torsoForwardDirection: Point3D
  ): number | null {
    const upperArmDirection = normalizeVector(subtractVectors(elbow, shoulder));
    if (!upperArmDirection) return null;
    return dotProduct(upperArmDirection, torsoForwardDirection);
  }
  
  export function areLandmarksVisible(
    pose: { visibility?: number }[],
    landmarkIndices: number[]
  ): boolean {
    return landmarkIndices.every(index => (pose[index]?.visibility ?? 0) >= 0.5);
  }
  
  export function isForwardRaiseValid(
    shoulderAngle: number | null,
    forwardScore: number | null
  ): boolean {
    if (shoulderAngle === null) return false;
    if (shoulderAngle <= 45) return true;
    return forwardScore !== null && forwardScore >= 0.45;
  }