/**
 * Converts MediaPipe pose landmarks into movement-specific measurements.
 * Shoulder and elbow angles describe joint movement; a torso-relative basis
 * distinguishes forward raises from lateral raises regardless of camera angle.
 */

export type Exercise = "front" | "bicep" | "lateral";
export type ArmSide = "left" | "right";
export type Point3D = { x: number; y: number; z: number };
export type VisiblePoint = Point3D & { visibility?: number };

export type ArmMeasurement = {
  visible: boolean;
  shoulderAngle: number | null;
  elbowAngle: number | null;
  forwardScore: number | null;
  outwardScore: number | null;
  screenHorizontal: number | null;
  // Pass null to the counter when movement does not match the exercise.
  repAngle: number | null;
  issue: "tracking" | "direction" | "elbow" | "shoulder" | null;
};

type TorsoFrame = { outwardLeft: Point3D; forward: Point3D };

const MIN_VISIBILITY = 0.35;
const MIN_EXTENDED_ELBOW = 145;
const DIRECTION_CHECK_START = 50;

function subtract(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(vector: Point3D): Point3D | null {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (magnitude < 0.000001) return null;
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function scale(vector: Point3D, scalar: number): Point3D {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function midpoint(a: Point3D, b: Point3D): Point3D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function angleBetween(a: Point3D, b: Point3D): number | null {
  const ua = normalize(a);
  const ub = normalize(b);
  if (!ua || !ub) return null;
  const cosine = Math.max(-1, Math.min(1, dot(ua, ub)));
  return Math.acos(cosine) * (180 / Math.PI);
}

function visible(pose: VisiblePoint[], indices: number[]): boolean {
  return indices.every(index => (pose[index]?.visibility ?? 0) >= MIN_VISIBILITY);
}

function torsoFrame(pose: Point3D[]): TorsoFrame | null {
  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const leftHip = pose[23];
  const rightHip = pose[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const up = normalize(subtract(midpoint(leftShoulder, rightShoulder), midpoint(leftHip, rightHip)));
  if (!up) return null;

  // Remove any vertical component from the shoulder axis, leaving an
  // outward direction perpendicular to the torso's up/down direction.
  const across = subtract(leftShoulder, rightShoulder);
  const horizontal = subtract(across, scale(up, dot(across, up)));
  const outwardLeft = normalize(horizontal);
  if (!outwardLeft) return null;

  const forward = normalize(cross(outwardLeft, up));
  if (!forward) return null;
  return { outwardLeft, forward };
}

function projectedElbowAngle(
  shoulder: VisiblePoint,
  elbow: VisiblePoint,
  wrist: VisiblePoint,
  videoWidth: number,
  videoHeight: number
): number | null {
  // 2D angles are often more stable for curls when facing the camera.
  // Convert normalized image coordinates to pixels to preserve aspect ratio.
  const upper = {
    x: (shoulder.x - elbow.x) * videoWidth,
    y: (shoulder.y - elbow.y) * videoHeight,
    z: 0,
  };
  const forearm = {
    x: (wrist.x - elbow.x) * videoWidth,
    y: (wrist.y - elbow.y) * videoHeight,
    z: 0,
  };
  if (Math.hypot(upper.x, upper.y) < 8 || Math.hypot(forearm.x, forearm.y) < 8) {
    return null;
  }
  return angleBetween(upper, forearm);
}

function emptyMeasurement(): ArmMeasurement {
  return {
    visible: false, shoulderAngle: null, elbowAngle: null,
    forwardScore: null, outwardScore: null, screenHorizontal: null,
    repAngle: null, issue: "tracking",
  };
}

export function measureArm(
  exercise: Exercise,
  side: ArmSide,
  worldPose: Point3D[],
  imagePose: VisiblePoint[],
  videoWidth: number,
  videoHeight: number
): ArmMeasurement {
  const [shoulderId, elbowId, wristId, hipId] = side === "left"
    ? [11, 13, 15, 23] : [12, 14, 16, 24];

  // Wrist visibility can dip during curls when the hand passes the shoulder.
  // Keep the important shoulder/elbow/hip visibility checks unchanged.
  if (!visible(imagePose, [shoulderId, elbowId, hipId])) return emptyMeasurement();
  if (exercise === "bicep" && (imagePose[wristId]?.visibility ?? 0) < 0.10) {
    return emptyMeasurement();
  }

  const shoulder = worldPose[shoulderId];
  const elbow = worldPose[elbowId];
  const wrist = worldPose[wristId];
  const hip = worldPose[hipId];
  if (!shoulder || !elbow || !hip) return emptyMeasurement();

  // Shoulder: ~0° when the arm hangs down, ~90° at shoulder height.
  const shoulderAngle = angleBetween(subtract(hip, shoulder), subtract(elbow, shoulder));
  // Elbow: ~180° when straight and smaller as the hand curls toward the shoulder.
  const worldElbowAngle = wrist
    ? angleBetween(subtract(shoulder, elbow), subtract(wrist, elbow))
    : null;
  const imageShoulder = imagePose[shoulderId];
  const imageElbow = imagePose[elbowId];
  const imageWrist = imagePose[wristId];
  const imageElbowAngle = imageShoulder && imageElbow && imageWrist
    ? projectedElbowAngle(imageShoulder, imageElbow, imageWrist, videoWidth, videoHeight)
    : null;
  // In a near-front camera view, the projected elbow angle avoids unstable
  // monocular depth estimates as the wrist approaches the shoulder.
  const elbowAngle = exercise === "bicep"
    ? (imageElbowAngle ?? worldElbowAngle)
    : worldElbowAngle;

  const frame = visible(imagePose, [11, 12, 23, 24]) ? torsoFrame(worldPose) : null;
  const upperArm = normalize(subtract(elbow, shoulder));
  const outward = frame && upperArm
    ? (side === "left" ? dot(upperArm, frame.outwardLeft) : -dot(upperArm, frame.outwardLeft))
    : null;
  const forward = frame && upperArm ? dot(upperArm, frame.forward) : null;

  // Horizontal screen travel is a useful second cue for forward raises when
  // the person stands partly side-on. Normalize by torso height so distance
  // from the webcam does not change the threshold dramatically.
  const imageHip = imagePose[hipId];
  const torsoPixels = imageShoulder && imageHip
    ? Math.hypot(imageHip.x - imageShoulder.x, imageHip.y - imageShoulder.y)
    : 0;
  const screenHorizontal = imageShoulder && imageElbow && torsoPixels > 0.0001
    ? Math.abs(imageElbow.x - imageShoulder.x) / torsoPixels
    : null;

  const result: ArmMeasurement = {
    visible: true, shoulderAngle, elbowAngle,
    forwardScore: forward, outwardScore: outward, screenHorizontal,
    repAngle: null, issue: null,
  };

  if (exercise === "bicep") {
    // A curl bends at the elbow while the upper arm stays beside the torso.
    // This rejects front raises that happen to change the projected elbow angle.
    if (elbowAngle === null) {
      result.issue = "tracking";
    } else if (shoulderAngle === null || shoulderAngle > 62) {
      result.issue = "shoulder";
    } else {
      result.repAngle = elbowAngle;
    }
    return result;
  }

  if (shoulderAngle === null) {
    result.issue = "tracking";
    return result;
  }

  // Arms near the starting position need not pass a direction check. This
  // avoids rejecting the down phase when the arms are nearly vertical.
  if (shoulderAngle < DIRECTION_CHECK_START) {
    result.repAngle = shoulderAngle;
    return result;
  }

  // Bent elbows can make a punch resemble a shoulder raise. For front raises,
  // allow a modest bend; lateral raises retain the stricter elbow requirement.
  if (!visible(imagePose, [wristId]) || elbowAngle === null) {
    result.issue = "tracking";
    return result;
  }
  const minimumElbow = exercise === "front" ? 135 : MIN_EXTENDED_ELBOW;
  if (elbowAngle < minimumElbow) {
    result.issue = "elbow";
    return result;
  }

  const forwardMagnitude = forward === null ? null : Math.abs(forward);
  const sideMagnitude = outward === null ? null : Math.abs(outward);

  if (exercise === "front") {
    // MediaPipe's monocular depth estimate is sometimes too uncertain for a
    // strict forward-vs-sideways 3D ratio. Use both torso-relative 3D direction
    // and screen-space arm travel. Sideways-dominant movements are rejected.
    const sidewaysDominant = sideMagnitude !== null &&
      sideMagnitude >= 0.78 &&
      sideMagnitude >= (forwardMagnitude ?? 0) * 1.2;
    const worldForward = forwardMagnitude !== null && sideMagnitude !== null &&
      forwardMagnitude >= 0.30 &&
      forwardMagnitude >= sideMagnitude * 0.65;
    const sideViewForward = screenHorizontal !== null &&
      screenHorizontal >= 0.27 &&
      (sideMagnitude === null || sideMagnitude <= 0.70);

    if (!sidewaysDominant && (worldForward || sideViewForward)) {
      result.repAngle = shoulderAngle;
    } else {
      result.issue = "direction";
    }
    return result;
  }

  // Keep lateral-raise classification unchanged: it already works well with
  // the person's shoulders facing the camera.
  const correctPlane = outward !== null && forwardMagnitude !== null &&
    outward >= 0.58 && outward >= forwardMagnitude * 1.35;

  if (!correctPlane) {
    result.issue = "direction";
  } else {
    result.repAngle = shoulderAngle;
  }
  return result;
}
