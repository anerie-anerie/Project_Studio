
import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import "./App.css";
import { FrontRaiseCounter } from "./lib/frontRaiseCounter";

// ==========================================
// 3D VECTOR HELPERS
// ==========================================

// Each MediaPipe world landmark has x, y, and z coordinates.
type Point3D = {
  x: number;
  y: number;
  z: number;
};

// Vector from pointB to pointA.
function subtractVectors(
  pointA: Point3D,
  pointB: Point3D
): Point3D {
  return {
    x: pointA.x - pointB.x,
    y: pointA.y - pointB.y,
    z: pointA.z - pointB.z,
  };
}

function vectorLength(vector: Point3D): number {
  return Math.hypot(
    vector.x,
    vector.y,
    vector.z
  );
}

// Normalize a vector so its length is 1.
function normalizeVector(
  vector: Point3D
): Point3D | null {
  const length = vectorLength(vector);

  if (length < 0.000001) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function dotProduct(
  vectorA: Point3D,
  vectorB: Point3D
): number {
  return (
    vectorA.x * vectorB.x +
    vectorA.y * vectorB.y +
    vectorA.z * vectorB.z
  );
}

// Produces a vector perpendicular to two vectors.
function crossProduct(
  vectorA: Point3D,
  vectorB: Point3D
): Point3D {
  return {
    x: vectorA.y * vectorB.z - vectorA.z * vectorB.y,
    y: vectorA.z * vectorB.x - vectorA.x * vectorB.z,
    z: vectorA.x * vectorB.y - vectorA.y * vectorB.x,
  };
}

function calculateMidpoint(
  pointA: Point3D,
  pointB: Point3D
): Point3D {
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
    z: (pointA.z + pointB.z) / 2,
  };
}

// ==========================================
// EXERCISE MEASUREMENTS
// ==========================================

// Measures the angle between the torso and upper arm.
// Arm down = approximately 0 degrees.
// Arm raised to shoulder height = approximately 90 degrees.
function calculateShoulderAngle(
  hip: Point3D,
  shoulder: Point3D,
  elbow: Point3D
): number | null {
  const torsoVector = subtractVectors(hip, shoulder);
  const upperArmVector = subtractVectors(elbow, shoulder);

  const torsoLength = vectorLength(torsoVector);
  const upperArmLength = vectorLength(upperArmVector);

  if (
    torsoLength < 0.000001 ||
    upperArmLength < 0.000001
  ) {
    return null;
  }

  const cosine =
    dotProduct(torsoVector, upperArmVector) /
    (torsoLength * upperArmLength);

  // Clamp to avoid floating-point rounding errors.
  const safeCosine = Math.max(
    -1,
    Math.min(1, cosine)
  );

  return Math.acos(safeCosine) * (180 / Math.PI);
}

// Estimate the direction the person's torso faces.
// Use the shoulder axis and torso-up direction.
function calculateTorsoForwardDirection(
  pose: Point3D[]
): Point3D | null {
  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const leftHip = pose[23];
  const rightHip = pose[24];

  const shoulderDirection = normalizeVector(
    subtractVectors(leftShoulder, rightShoulder)
  );

  const shoulderCenter = calculateMidpoint(
    leftShoulder,
    rightShoulder
  );

  const hipCenter = calculateMidpoint(
    leftHip,
    rightHip
  );

  const torsoUpDirection = normalizeVector(
    subtractVectors(shoulderCenter, hipCenter)
  );

  if (!shoulderDirection || !torsoUpDirection) {
    return null;
  }

  const forwardVector = crossProduct(
    shoulderDirection,
    torsoUpDirection
  );

  return normalizeVector(forwardVector);
}

// Measures whether the upper arm is pointing forward
// relative to the person's torso.
function calculateArmForwardScore(
  shoulder: Point3D,
  elbow: Point3D,
  torsoForwardDirection: Point3D
): number | null {
  const upperArmDirection = normalizeVector(
    subtractVectors(elbow, shoulder)
  );

  if (!upperArmDirection) {
    return null;
  }

  return dotProduct(
    upperArmDirection,
    torsoForwardDirection
  );
}

// Every required joint must have sufficient visibility.
// MediaPipe visibility values range from 0 to 1.
function areLandmarksVisible(
  pose: { visibility?: number }[],
  landmarkIndices: number[]
): boolean {
  return landmarkIndices.every(
    index => (pose[index].visibility ?? 0) >= 0.5
  );
}

// Below 45 degrees, arm direction is not evaluated.
// Above 45 degrees, the arm must point sufficiently forward.
function isForwardRaiseValid(
  shoulderAngle: number | null,
  forwardScore: number | null
): boolean {
  if (shoulderAngle === null) {
    return false;
  }

  if (shoulderAngle <= 45) {
    return true;
  }

  return (
    forwardScore !== null &&
    forwardScore >= 0.45
  );
}

// ==========================================
// MAIN APPLICATION
// ==========================================

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState(
    "Initializing..."
  );

  // Raw measurements for each arm.
  const [leftShoulderAngle, setLeftShoulderAngle] =
    useState<number | null>(null);

  const [rightShoulderAngle, setRightShoulderAngle] =
    useState<number | null>(null);

  const [leftForwardScore, setLeftForwardScore] =
    useState<number | null>(null);

  const [rightForwardScore, setRightForwardScore] =
    useState<number | null>(null);

  // User-facing feedback.
  const [exerciseFeedback, setExerciseFeedback] =
    useState(
      "Position yourself in front of the camera."
    );

  const [reps, setReps] = useState(0);

  // Preserves the DOWN / UP / WAITING state
  // between React renders.
  const counterRef = useRef(
    new FrontRaiseCounter()
  );

  // ==========================================
  // MEDIAPIPE + WEBCAM
  // ==========================================

  useEffect(() => {
    let stopped = false;
    let frameId = 0;

    let cameraStream: MediaStream | null = null;
    let detector: PoseLandmarker | null = null;

    async function initialize() {
      try {
        setStatus("Loading MediaPipe...");

        const vision =
          await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
          );

        if (stopped) return;

        // Initialize pose landmark detection.
        const model =
          await PoseLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numPoses: 1,
            }
          );

        if (stopped) {
          model.close();
          return;
        }

        detector = model;

        setStatus("Requesting camera access...");

        // No audio needed.
        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });

        if (stopped) {
          stream
            .getTracks()
            .forEach(track => track.stop());

          return;
        }

        cameraStream = stream;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) {
          return;
        }

        video.srcObject = stream;
        await video.play();

        if (stopped) return;

        const canvasContext =
          canvas.getContext("2d");

        if (!canvasContext) {
          throw new Error("Canvas unavailable");
        }

        const drawing = new DrawingUtils(
          canvasContext
        );

        let lastVideoTime = -1;
        let lastAngleUpdate = 0;

        // Continuously process new webcam frames.
        function track() {
          if (stopped || !video || !canvas) {
            return;
          }

          if (
            video.readyState >= 2 &&
            video.currentTime !== lastVideoTime
          ) {
            // Keep canvas resolution equal to video resolution.
            if (
              canvas.width !== video.videoWidth ||
              canvas.height !== video.videoHeight
            ) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }

            canvasContext!.clearRect(
              0,
              0,
              canvas.width,
              canvas.height
            );

            const currentTime = performance.now();

            const result = model.detectForVideo(
              video,
              currentTime
            );

            // Draw skeleton only, not the original video.
            for (const pose of result.landmarks) {
              drawing.drawConnectors(
                pose,
                PoseLandmarker.POSE_CONNECTIONS,
                {
                  color: "#00FF99",
                  lineWidth: 3,
                }
              );

              drawing.drawLandmarks(pose, {
                color: "#FF5555",
                radius: 4,
              });
            }

            // Analyze movement about every 50 ms.
            if (
              currentTime - lastAngleUpdate > 50
            ) {
              const imagePose =
                result.landmarks[0];

              const worldPose =
                result.worldLandmarks[0];

              if (imagePose && worldPose) {
                // Check the two arms independently.
                const leftArmVisible =
                  areLandmarksVisible(
                    imagePose,
                    [11, 13, 23]
                  );

                const rightArmVisible =
                  areLandmarksVisible(
                    imagePose,
                    [12, 14, 24]
                  );

                // Torso landmarks are needed to determine
                // which way the person faces.
                const torsoVisible =
                  areLandmarksVisible(
                    imagePose,
                    [11, 12, 23, 24]
                  );

                // Calculate raw shoulder angles.
                const measuredLeftAngle =
                  leftArmVisible
                    ? calculateShoulderAngle(
                        worldPose[23],
                        worldPose[11],
                        worldPose[13]
                      )
                    : null;

                const measuredRightAngle =
                  rightArmVisible
                    ? calculateShoulderAngle(
                        worldPose[24],
                        worldPose[12],
                        worldPose[14]
                      )
                    : null;

                const torsoForwardDirection =
                  torsoVisible
                    ? calculateTorsoForwardDirection(
                        worldPose
                      )
                    : null;

                // Estimate forward direction for each arm.
                const measuredLeftForwardScore =
                  leftArmVisible &&
                  torsoForwardDirection
                    ? calculateArmForwardScore(
                        worldPose[11],
                        worldPose[13],
                        torsoForwardDirection
                      )
                    : null;

                const measuredRightForwardScore =
                  rightArmVisible &&
                  torsoForwardDirection
                    ? calculateArmForwardScore(
                        worldPose[12],
                        worldPose[14],
                        torsoForwardDirection
                      )
                    : null;

                // Store raw measurements.
                // These also power the arm detection UI.
                setLeftShoulderAngle(
                  measuredLeftAngle
                );

                setRightShoulderAngle(
                  measuredRightAngle
                );

                setLeftForwardScore(
                  measuredLeftForwardScore
                );

                setRightForwardScore(
                  measuredRightForwardScore
                );

                // Check that raised arms move forward,
                // rather than sideways.
                const leftMovementValid =
                  isForwardRaiseValid(
                    measuredLeftAngle,
                    measuredLeftForwardScore
                  );

                const rightMovementValid =
                  isForwardRaiseValid(
                    measuredRightAngle,
                    measuredRightForwardScore
                  );

                // Invalid movements become null before
                // being passed to the rep counter.
                const validatedLeftAngle =
                  leftMovementValid
                    ? measuredLeftAngle
                    : null;

                const validatedRightAngle =
                  rightMovementValid
                    ? measuredRightAngle
                    : null;

                // Determine current feedback.
                const leftWrongDirection =
                  measuredLeftAngle !== null &&
                  measuredLeftAngle > 45 &&
                  !leftMovementValid;

                const rightWrongDirection =
                  measuredRightAngle !== null &&
                  measuredRightAngle > 45 &&
                  !rightMovementValid;

                if (
                  leftWrongDirection ||
                  rightWrongDirection
                ) {
                  setExerciseFeedback(
                    "Raise both arms forward, not sideways."
                  );
                } else if (
                  !leftArmVisible ||
                  !rightArmVisible
                ) {
                  setExerciseFeedback(
                    "Make sure both arms and hips are visible."
                  );
                } else {
                  setExerciseFeedback(
                    "Tracking both arms."
                  );
                }

                // Existing two-arm repetition counter.
                // One rep requires DOWN -> UP -> DOWN.
                const repetitionCompleted =
                  counterRef.current.update(
                    validatedLeftAngle,
                    validatedRightAngle,
                    currentTime
                  );

                if (repetitionCompleted) {
                  setReps(
                    previousReps =>
                      previousReps + 1
                  );
                }
              } else {
                // No body detected.
                setLeftShoulderAngle(null);
                setRightShoulderAngle(null);

                setLeftForwardScore(null);
                setRightForwardScore(null);

                setExerciseFeedback(
                  "Body not detected."
                );

                counterRef.current.update(
                  null,
                  null,
                  currentTime
                );
              }

              lastAngleUpdate = currentTime;
            }

            lastVideoTime = video.currentTime;
          }

          frameId = requestAnimationFrame(track);
        }

        setStatus("Tracking active!");

        frameId = requestAnimationFrame(track);
      } catch (error) {
        if (!stopped) {
          setStatus(
            error instanceof Error
              ? error.message
              : String(error)
          );
        }
      }
    }

    void initialize();

    // Stop webcam, animation loop, and MediaPipe.
    return () => {
      stopped = true;

      cancelAnimationFrame(frameId);

      cameraStream
        ?.getTracks()
        .forEach(track => track.stop());

      detector?.close();
    };
  }, []);

  // ==========================================
  // VALUES USED BY THE INTERFACE
  // ==========================================

  // If a shoulder angle is available, the required
  // landmarks for that arm are being tracked.
  const leftArmDetected =
    leftShoulderAngle !== null;

  const rightArmDetected =
    rightShoulderAngle !== null;

  const trackingGood =
    exerciseFeedback === "Tracking both arms.";

  // ==========================================
  // USER INTERFACE
  // ==========================================

  return (
    <main className="je-page">
      <div className="je-shell">

        {/* HEADER */}
        <header className="je-header">
          <div className="je-brand">
            Just Exercise
          </div>

          <div className="je-status">
            <span
              className={
                status === "Tracking active!"
                  ? "je-status-dot active"
                  : "je-status-dot"
              }
            />

            {status === "Tracking active!"
              ? "Camera active"
              : status}
          </div>
        </header>

        {/* CENTERED EXERCISE TITLE */}
        <div className="je-title">
          <h1>
            Exercise: <strong>Front Raises</strong>
          </h1>
        </div>

        {/* MAIN 50/50 WORKSPACE */}
        <div className="je-workspace">

          {/* LEFT: CAMERA */}
          <section className="je-camera-section">
            <div className="je-camera">

              {/* Hidden webcam video */}
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="je-video"
              />

              {/* Visible pose skeleton */}
              <canvas
                ref={canvasRef}
                className="je-canvas"
                role="img"
                aria-label="Live skeleton tracking"
              />

            </div>
          </section>

          {/* RIGHT: INSTRUCTIONS, DETECTION, REPS */}
          <section className="je-info">

            <div className="je-instructions-panel">

              {/* INSTRUCTIONS */}
              <ol className="je-instructions">
                <li>
                  <span className="je-step">01</span>

                  <span>
                    Stand approximately 30–45° to
                    the camera, with both arms
                    and hips visible.
                  </span>
                </li>

                <li>
                  <span className="je-step">02</span>

                  <span>
                    Start with both arms down
                    by your sides.
                  </span>
                </li>

                <li>
                  <span className="je-step">03</span>

                  <span>
                    Raise both arms forward to
                    shoulder height, then lower
                    them together.
                  </span>
                </li>
              </ol>

              {/* LIVE ARM DETECTION */}
              <div className="je-arm-tracking">

                <div className="je-arm-tracking-list">

                  {/* LEFT ARM */}
                  <div className="je-arm-line">
                    <span className="je-arm-name">
                      Left Arm
                    </span>

                    <span
                      className={
                        leftArmDetected
                          ? "je-arm-state detected"
                          : "je-arm-state"
                      }
                    >
                      <span className="je-arm-dot" />

                      {leftArmDetected
                        ? "Detected"
                        : "Not detected"}
                    </span>
                  </div>

                  {/* RIGHT ARM */}
                  <div className="je-arm-line">
                    <span className="je-arm-name">
                      Right Arm
                    </span>

                    <span
                      className={
                        rightArmDetected
                          ? "je-arm-state detected"
                          : "je-arm-state"
                      }
                    >
                      <span className="je-arm-dot" />

                      {rightArmDetected
                        ? "Detected"
                        : "Not detected"}
                    </span>
                  </div>

                </div>
              </div>
            </div>

            {/* COMPLETED REPS */}
            <div className="je-rep-area">
              <div className="je-rep-details">

                <div>
                  <p className="je-rep-label">
                    Completed Reps
                  </p>

                  <div
                    className="je-rep-number"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {reps}
                  </div>
                </div>

                <button
                  type="button"
                  className="je-reset"
                  onClick={() => {
                    counterRef.current.reset();
                    setReps(0);
                  }}
                >
                  Reset Counter
                </button>

              </div>
            </div>
          </section>
        </div>

        {/* FULL-WIDTH FORM FEEDBACK */}
        <section
          className={
            trackingGood
              ? "je-feedback is-good"
              : "je-feedback"
          }
        >
          <h2>Form Feedback</h2>

          <div className="je-feedback-content">
            <span className="je-feedback-dot" />

            <p aria-live="polite">
              {exerciseFeedback}
            </p>
          </div>
        </section>

        {/* ADVANCED DIAGNOSTICS */}
        <details className="je-diagnostics">
          <summary>
            Advanced Measurements
          </summary>

          <div className="je-measurements">

            <p>
              Left shoulder:{" "}
              <strong>
                {leftShoulderAngle === null
                  ? "Not detected"
                  : `${leftShoulderAngle.toFixed(0)}°`}
              </strong>
            </p>

            <p>
              Right shoulder:{" "}
              <strong>
                {rightShoulderAngle === null
                  ? "Not detected"
                  : `${rightShoulderAngle.toFixed(0)}°`}
              </strong>
            </p>

            <p>
              Left forward score:{" "}
              <strong>
                {leftForwardScore === null
                  ? "Not detected"
                  : leftForwardScore.toFixed(2)}
              </strong>
            </p>

            <p>
              Right forward score:{" "}
              <strong>
                {rightForwardScore === null
                  ? "Not detected"
                  : rightForwardScore.toFixed(2)}
              </strong>
            </p>

          </div>
        </details>

      </div>
    </main>
  );
}
