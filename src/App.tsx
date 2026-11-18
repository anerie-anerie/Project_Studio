import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import "./App.css";
import { FrontRaiseCounter } from "./lib/frontRaiseCounter";
import { connectArduino } from "./lib/arduino";
import {
  calculateShoulderAngle,
  calculateTorsoForwardDirection,
  calculateArmForwardScore,
  areLandmarksVisible,
  isForwardRaiseValid,
} from "./lib/exerciseGeometry";
import { LiveRepBoard } from "./components/LiveRepBoard";

const API_BASE_URL = "http://localhost:5001";

// ==========================================
// MAIN APPLICATION
// ==========================================

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState("Initializing...");

  // Arduino state
  const [acceleration, setAcceleration] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const [arduinoStatus, setArduinoStatus] = useState("Connect Arduino");
  const [speedWarning, setSpeedWarning] = useState("Waiting for connection...");

  async function handleConnect() {
    setConnected(true);
    await connectArduino(
      (statusMsg) => setArduinoStatus(statusMsg),
      (warningMsg) => setSpeedWarning(warningMsg),
      (val) => setAcceleration(val)
    );
  }

  // Raw measurements for each arm
  const [leftShoulderAngle, setLeftShoulderAngle] = useState<number | null>(null);
  const [rightShoulderAngle, setRightShoulderAngle] = useState<number | null>(null);
  const [leftForwardScore, setLeftForwardScore] = useState<number | null>(null);
  const [rightForwardScore, setRightForwardScore] = useState<number | null>(null);

  // User-facing feedback & rep tracking
  const [exerciseFeedback, setExerciseFeedback] = useState(
    "Position yourself in front of the camera."
  );
  const [reps, setReps] = useState(0);

  // Patient name & session lifecycle state
  const [nameInput, setNameInput] = useState("");
  const [patientName, setPatientName] = useState("Anonymous Patient");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionMessage, setSessionMessage] = useState(
    "Type a patient name and press Submit Name, then Start Session."
  );

  const counterRef = useRef(new FrontRaiseCounter());
  const sessionIdRef = useRef<string | null>(null);
  const patientNameRef = useRef(patientName);
  const sessionActiveRef = useRef(sessionActive);
  const repsRef = useRef(reps);

  useEffect(() => {
    patientNameRef.current = patientName;
  }, [patientName]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    repsRef.current = reps;
  }, [reps]);

  async function syncSessionToMongoDB(params: {
    sessionId: string;
    name: string;
    nextReps: number;
    status: "active" | "completed";
    endedAt?: string | null;
  }) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/reps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: params.sessionId,
          patientName: params.name,
          userName: params.name,
          exercise: "front_raises",
          reps: params.nextReps,
          status: params.status,
          endedAt: params.endedAt ?? null,
        }),
      });

      if (!res.ok) {
        console.error("Failed to sync session:", await res.text());
      }
    } catch (err) {
      console.error("Error syncing session to MongoDB:", err);
    }
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    const finalName = trimmed || "Anonymous Patient";
    setPatientName(finalName);
    patientNameRef.current = finalName;
    setNameSubmitted(true);
    setSessionMessage(`Patient name set to "${finalName}". Click Start Session to begin.`);
  }

  function handleStartSession() {
    const activeName =
      nameInput.trim() || patientNameRef.current || "Anonymous Patient";
    setPatientName(activeName);
    patientNameRef.current = activeName;
    setNameSubmitted(true);

    const newSessionId = crypto.randomUUID();
    sessionIdRef.current = newSessionId;
    counterRef.current.reset();
    setReps(0);
    repsRef.current = 0;
    setSessionActive(true);
    sessionActiveRef.current = true;
    setSessionMessage(`Session started for ${activeName}.`);

    void syncSessionToMongoDB({
      sessionId: newSessionId,
      name: activeName,
      nextReps: 0,
      status: "active",
    });
  }

  function handleEndSession() {
    if (!sessionIdRef.current) return;

    setSessionActive(false);
    sessionActiveRef.current = false;
    setSessionMessage(
      `Session ended for ${patientNameRef.current} (${repsRef.current} reps recorded).`
    );

    void syncSessionToMongoDB({
      sessionId: sessionIdRef.current,
      name: patientNameRef.current,
      nextReps: repsRef.current,
      status: "completed",
      endedAt: new Date().toISOString(),
    });
  }

  function setAndSyncReps(nextReps: number) {
    const safeReps = Math.max(0, nextReps);
    setReps(safeReps);
    repsRef.current = safeReps;

    if (sessionIdRef.current) {
      void syncSessionToMongoDB({
        sessionId: sessionIdRef.current,
        name: patientNameRef.current,
        nextReps: safeReps,
        status: sessionActiveRef.current ? "active" : "completed",
      });
    }
  }

  function incrementReps() {
    if (!sessionActiveRef.current || !sessionIdRef.current) return;

    setReps((previousReps) => {
      const nextReps = previousReps + 1;
      repsRef.current = nextReps;
      void syncSessionToMongoDB({
        sessionId: sessionIdRef.current!,
        name: patientNameRef.current,
        nextReps,
        status: "active",
      });
      return nextReps;
    });
  }

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

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        if (stopped) return;

        const model = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        if (stopped) {
          model.close();
          return;
        }

        detector = model;
        setStatus("Requesting camera access...");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        cameraStream = stream;
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) return;

        video.srcObject = stream;
        await video.play();

        if (stopped) return;

        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) {
          throw new Error("Canvas unavailable");
        }

        const drawing = new DrawingUtils(canvasContext);
        let lastVideoTime = -1;
        let lastAngleUpdate = 0;

        function track() {
          if (stopped || !video || !canvas) return;

          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            if (
              canvas.width !== video.videoWidth ||
              canvas.height !== video.videoHeight
            ) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }

            canvasContext!.clearRect(0, 0, canvas.width, canvas.height);

            const currentTime = performance.now();
            const result = model.detectForVideo(video, currentTime);

            for (const pose of result.landmarks) {
              drawing.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, {
                color: "#00FF99",
                lineWidth: 3,
              });

              drawing.drawLandmarks(pose, {
                color: "#FF5555",
                radius: 4,
              });
            }

            if (currentTime - lastAngleUpdate > 50) {
              const imagePose = result.landmarks[0];
              const worldPose = result.worldLandmarks[0];

              if (imagePose && worldPose) {
                const leftArmVisible = areLandmarksVisible(imagePose, [11, 13, 23]);
                const rightArmVisible = areLandmarksVisible(imagePose, [12, 14, 24]);
                const torsoVisible = areLandmarksVisible(imagePose, [11, 12, 23, 24]);

                const measuredLeftAngle = leftArmVisible
                  ? calculateShoulderAngle(worldPose[23], worldPose[11], worldPose[13])
                  : null;

                const measuredRightAngle = rightArmVisible
                  ? calculateShoulderAngle(worldPose[24], worldPose[12], worldPose[14])
                  : null;

                const torsoForwardDirection = torsoVisible
                  ? calculateTorsoForwardDirection(worldPose)
                  : null;

                const measuredLeftForwardScore =
                  leftArmVisible && torsoForwardDirection
                    ? calculateArmForwardScore(
                        worldPose[11],
                        worldPose[13],
                        torsoForwardDirection
                      )
                    : null;

                const measuredRightForwardScore =
                  rightArmVisible && torsoForwardDirection
                    ? calculateArmForwardScore(
                        worldPose[12],
                        worldPose[14],
                        torsoForwardDirection
                      )
                    : null;

                setLeftShoulderAngle(measuredLeftAngle);
                setRightShoulderAngle(measuredRightAngle);
                setLeftForwardScore(measuredLeftForwardScore);
                setRightForwardScore(measuredRightForwardScore);

                const leftMovementValid = isForwardRaiseValid(
                  measuredLeftAngle,
                  measuredLeftForwardScore
                );
                const rightMovementValid = isForwardRaiseValid(
                  measuredRightAngle,
                  measuredRightForwardScore
                );

                const validatedLeftAngle = leftMovementValid
                  ? measuredLeftAngle
                  : null;
                const validatedRightAngle = rightMovementValid
                  ? measuredRightAngle
                  : null;

                const leftWrongDirection =
                  measuredLeftAngle !== null &&
                  measuredLeftAngle > 45 &&
                  !leftMovementValid;
                const rightWrongDirection =
                  measuredRightAngle !== null &&
                  measuredRightAngle > 45 &&
                  !rightMovementValid;

                if (leftWrongDirection || rightWrongDirection) {
                  setExerciseFeedback("Raise both arms forward, not sideways.");
                } else if (!leftArmVisible || !rightArmVisible) {
                  setExerciseFeedback("Make sure both arms and hips are visible.");
                } else {
                  setExerciseFeedback("Tracking both arms.");
                }

                const repetitionCompleted = counterRef.current.update(
                  validatedLeftAngle,
                  validatedRightAngle,
                  currentTime
                );

                if (repetitionCompleted && sessionActiveRef.current) {
                  incrementReps();
                }
              } else {
                setLeftShoulderAngle(null);
                setRightShoulderAngle(null);
                setLeftForwardScore(null);
                setRightForwardScore(null);
                setExerciseFeedback("Body not detected.");
                counterRef.current.update(null, null, currentTime);
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
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void initialize();

    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
      cameraStream?.getTracks().forEach((track) => track.stop());
      detector?.close();
    };
  }, []);

  const leftArmDetected = leftShoulderAngle !== null;
  const rightArmDetected = rightShoulderAngle !== null;
  const trackingGood = exerciseFeedback === "Tracking both arms.";

  return (
    <main className="je-page">
      <div className="je-shell">
        <header className="je-header">
          <div className="je-brand">Just Exercise</div>
          <div className="je-status">
            <span
              className={
                status === "Tracking active!"
                  ? "je-status-dot active"
                  : "je-status-dot"
              }
            />
            {status === "Tracking active!" ? "Camera active" : status}
          </div>
        </header>

        <div className="je-title">
          <h1>
            Exercise: <strong>Front Raises</strong>
          </h1>
        </div>

        <div className="je-workspace">
          <section className="je-camera-section">
            <div className="je-camera">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="je-video"
              />
              <canvas
                ref={canvasRef}
                className="je-canvas"
                role="img"
                aria-label="Live skeleton tracking"
              />
            </div>
          </section>

          <section className="je-info">
            <div className="je-instructions-panel">
              <ol className="je-instructions">
                <li>
                  <span className="je-step">01</span>
                  <span>
                    Stand approximately 30–45° to the camera, with both arms and
                    hips visible.
                  </span>
                </li>
                <li>
                  <span className="je-step">02</span>
                  <span>Start with both arms down by your sides.</span>
                </li>
                <li>
                  <span className="je-step">03</span>
                  <span>
                    Raise both arms forward to shoulder height, then lower them
                    together.
                  </span>
                </li>
              </ol>

              <div className="je-arm-tracking">
                <div className="je-arm-tracking-list">
                  <div className="je-arm-line">
                    <span className="je-arm-name">Left Arm</span>
                    <span
                      className={
                        leftArmDetected ? "je-arm-state detected" : "je-arm-state"
                      }
                    >
                      <span className="je-arm-dot" />
                      {leftArmDetected ? "Detected" : "Not detected"}
                    </span>
                  </div>

                  <div className="je-arm-line">
                    <span className="je-arm-name">Right Arm</span>
                    <span
                      className={
                        rightArmDetected ? "je-arm-state detected" : "je-arm-state"
                      }
                    >
                      <span className="je-arm-dot" />
                      {rightArmDetected ? "Detected" : "Not detected"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="je-rep-area">
              <div
                className="je-rep-details"
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: "0.75rem",
                }}
              >
                <form
                  onSubmit={handleNameSubmit}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <label style={{ fontSize: "0.85rem" }}>
                    Patient Name:{" "}
                    <input
                      type="text"
                      placeholder="Enter patient name"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="je-reset">
                    Submit Name
                  </button>
                </form>

                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  <strong>Patient:</strong>{" "}
                  {nameSubmitted ? patientName : "Not submitted yet"} |{" "}
                  <strong>Session:</strong>{" "}
                  {sessionActive ? "Active" : "Ended / Not started"}
                </p>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="je-reset"
                    onClick={handleStartSession}
                    disabled={sessionActive}
                  >
                    Start Session
                  </button>

                  <button
                    type="button"
                    className="je-reset"
                    onClick={handleEndSession}
                    disabled={!sessionActive}
                  >
                    End Session
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <p className="je-rep-label">Completed Reps</p>
                    <div
                      className="je-rep-number"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {reps}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="je-reset"
                      onClick={incrementReps}
                      disabled={!sessionActive}
                    >
                      +1 Rep
                    </button>

                    <button
                      type="button"
                      className="je-reset"
                      onClick={() => setAndSyncReps(reps - 1)}
                      disabled={!sessionActive}
                    >
                      -1 Rep
                    </button>

                    <button
                      type="button"
                      className="je-reset"
                      onClick={() => {
                        counterRef.current.reset();
                        setAndSyncReps(0);
                      }}
                    >
                      Reset Counter
                    </button>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.85 }}>
                  {sessionMessage}
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className={trackingGood ? "je-feedback is-good" : "je-feedback"}>
          <h2>Form Feedback</h2>
          <div className="je-feedback-content">
            <span className="je-feedback-dot" />
            <p aria-live="polite">{exerciseFeedback}</p>
          </div>
        </section>

        <LiveRepBoard />

        <div className="je-arduino-section" style={{ marginTop: "1rem" }}>
          {!connected ? (
            <button type="button" className="je-reset" onClick={handleConnect}>
              Connect Arduino
            </button>
          ) : (
            <div>
              <p>
                <strong>{arduinoStatus}</strong>
              </p>
              <p>Live Acceleration: {acceleration.toFixed(1)}</p>
              <p style={{ color: "#FF5555", fontWeight: "bold" }}>
                {speedWarning}
              </p>
            </div>
          )}
        </div>

        <details className="je-diagnostics">
          <summary>Advanced Measurements</summary>
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