import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import "./App.css";
import "./exerciseSelector.css";
import { measureArm, type ArmMeasurement, type Exercise } from "./lib/exerciseMeasurements";
import { TwoArmRepCounter } from "./lib/twoArmRepCounter";

const exercises: Record<Exercise, { name: string; instructions: string[] }> = {
  front: {
    name: "Front Raises",
    instructions: [
      "Stand about 30° to the camera so both arms stay visible.",
      "Start with both arms down by your sides.",
      "Keep elbows mostly straight. Raise both arms FORWARD to shoulder height, then lower.",
    ],
  },
  bicep: {
    name: "Bicep Curls",
    instructions: [
      "Face the camera or turn slightly (0–30°). Keep both elbows and wrists visible.",
      "Start with arms straight and upper arms by your sides.",
      "Keep upper arms close to your body. Bend both elbows, then straighten.",
    ],
  },
  lateral: {
    name: "Lateral Raises",
    instructions: [
      "Face the camera straight on, with both arms and hips visible.",
      "Start with both arms down by your sides.",
      "Keep elbows mostly straight. Raise both arms OUT to the sides, then lower.",
    ],
  },
};

function feedbackFor(exercise: Exercise, left: ArmMeasurement, right: ArmMeasurement): string {
  const measurements = [left, right];
  if (measurements.some(arm => !arm.visible || arm.issue === "tracking")) {
    return "Keep both arms, wrists, shoulders, and hips visible.";
  }
  if (exercise === "bicep") {
    return measurements.some(arm => arm.issue === "shoulder")
      ? "Keep your upper arms close to your body; bend at the elbows."
      : "Tracking both arms.";
  }
  if (measurements.some(arm => arm.issue === "elbow")) {
    return "Keep your elbows mostly straight while raising your arms.";
  }
  if (measurements.some(arm => arm.issue === "direction")) {
    return exercise === "front"
      ? "Stand about 30° to the camera. Raise your arms forward, not out to the sides."
      : "Raise your arms out to the sides, not forward.";
  }
  return "Tracking both arms.";
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [exercise, setExercise] = useState<Exercise>("front");
  const [exerciseMenuOpen, setExerciseMenuOpen] = useState(false);
  // A ref gives the camera loop the current selection without restarting MediaPipe.
  const selectedExerciseRef = useRef<Exercise>("front");
  const counters = useRef({
    front: new TwoArmRepCounter("front"),
    bicep: new TwoArmRepCounter("curl"),
    lateral: new TwoArmRepCounter("lateral"),
  });

  const [status, setStatus] = useState("Initializing...");
  const [exerciseFeedback, setExerciseFeedback] = useState("Position yourself in front of the camera.");
  const [reps, setReps] = useState(0);
  const repsRef = useRef(0);
  const [leftArmDetected, setLeftArmDetected] = useState(false);
  const [rightArmDetected, setRightArmDetected] = useState(false);
  const [leftAngle, setLeftAngle] = useState<number | null>(null);
  const [rightAngle, setRightAngle] = useState<number | null>(null);
  const [leftElbowAngle, setLeftElbowAngle] = useState<number | null>(null);
  const [rightElbowAngle, setRightElbowAngle] = useState<number | null>(null);
  const [leftDirection, setLeftDirection] = useState<number | null>(null);
  const [rightDirection, setRightDirection] = useState<number | null>(null);
  const [leftOutward, setLeftOutward] = useState<number | null>(null);
  const [rightOutward, setRightOutward] = useState<number | null>(null);
  const [leftScreenTravel, setLeftScreenTravel] = useState<number | null>(null);
  const [rightScreenTravel, setRightScreenTravel] = useState<number | null>(null);
  const [stageText, setStageText] = useState("Start with both arms down");

  function resetCounters(): void {
    counters.current.front.reset();
    counters.current.bicep.reset();
    counters.current.lateral.reset();
    repsRef.current = 0;
    setReps(0);
    setStageText("Start with both arms down");
  }

  function changeExercise(next: Exercise): void {
    selectedExerciseRef.current = next;
    setExercise(next);
    setExerciseMenuOpen(false);
    resetCounters();
    setLeftAngle(null);
    setRightAngle(null);
    setLeftElbowAngle(null);
    setRightElbowAngle(null);
    setLeftDirection(null);
    setRightDirection(null);
    setLeftOutward(null);
    setRightOutward(null);
    setLeftScreenTravel(null);
    setRightScreenTravel(null);
    setLeftArmDetected(false);
    setRightArmDetected(false);
    setExerciseFeedback("Position yourself in front of the camera.");

    // Integration event for other components, including the hardware interface.
    window.dispatchEvent(new CustomEvent("justexercise:exercisechange", {
      detail: { exercise: next },
    }));
  }

  useEffect(() => {
    let stopped = false;
    let animationFrame = 0;
    let cameraStream: MediaStream | null = null;
    let detector: PoseLandmarker | null = null;

    async function initialize(): Promise<void> {
      try {
        setStatus("Loading MediaPipe...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        if (stopped) return;

        const model = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
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
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (stopped) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        cameraStream = stream;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        video.srcObject = stream;
        await video.play();
        if (stopped) return;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const drawing = new DrawingUtils(context);
        let lastVideoTime = -1;
        let lastMeasurementTime = 0;

        function track(): void {
          if (stopped || !video || !canvas) return;
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            context!.clearRect(0, 0, canvas.width, canvas.height);
            const now = performance.now();
            const result = model.detectForVideo(video, now);

            // Draw body landmarks without displaying the original webcam image.
            for (const pose of result.landmarks) {
              drawing.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, {
                color: "#00FF99", lineWidth: 3,
              });
              drawing.drawLandmarks(pose, { color: "#FF5555", radius: 4 });
            }

            // Process movement at approximately 20 updates per second.
            if (now - lastMeasurementTime > 50) {
              const imagePose = result.landmarks[0];
              const worldPose = result.worldLandmarks[0];
              const mode = selectedExerciseRef.current;
              const counter = counters.current[mode];

              if (!imagePose || !worldPose) {
                setLeftArmDetected(false);
                setRightArmDetected(false);
                setLeftAngle(null);
                setRightAngle(null);
                setLeftElbowAngle(null);
                setRightElbowAngle(null);
                setLeftDirection(null);
                setRightDirection(null);
                setLeftOutward(null);
                setRightOutward(null);
                setLeftScreenTravel(null);
                setRightScreenTravel(null);
                setExerciseFeedback("Body not detected.");
                counter.update(null, null, now);
              } else {
                const left = measureArm(mode, "left", worldPose, imagePose, video.videoWidth, video.videoHeight);
                const right = measureArm(mode, "right", worldPose, imagePose, video.videoWidth, video.videoHeight);
                setLeftArmDetected(left.visible);
                setRightArmDetected(right.visible);
                setLeftAngle(mode === "bicep" ? left.elbowAngle : left.shoulderAngle);
                setRightAngle(mode === "bicep" ? right.elbowAngle : right.shoulderAngle);
                setLeftElbowAngle(left.elbowAngle);
                setRightElbowAngle(right.elbowAngle);
                setLeftDirection(mode === "front" ? left.forwardScore : left.outwardScore);
                setRightDirection(mode === "front" ? right.forwardScore : right.outwardScore);
                setLeftOutward(left.outwardScore);
                setRightOutward(right.outwardScore);
                setLeftScreenTravel(left.screenHorizontal);
                setRightScreenTravel(right.screenHorizontal);
                setExerciseFeedback(feedbackFor(mode, left, right));

                const completed = counter.update(left.repAngle, right.repAngle, now);
                if (completed) {
                  repsRef.current += 1;
                  setReps(repsRef.current);
                  // Broadcast a completed rep for the team's hardware/dashboard code.
                  window.dispatchEvent(new CustomEvent("justexercise:rep", {
                    detail: { exercise: mode, reps: repsRef.current, timestamp: now },
                  }));
                }
              }
              setStageText(counter.getStatus());
              lastMeasurementTime = now;
            }
            lastVideoTime = video.currentTime;
          }
          animationFrame = requestAnimationFrame(track);
        }

        setStatus("Tracking active!");
        animationFrame = requestAnimationFrame(track);
      } catch (error) {
        if (!stopped) setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    void initialize();
    return () => {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      cameraStream?.getTracks().forEach(track => track.stop());
      detector?.close();
    };
  }, []);

  const trackingGood = exerciseFeedback === "Tracking both arms.";
  const directionLabel = exercise === "front" ? "forward" : "outward";

  return (
    <main className="je-page">
      <div className="je-shell">
        <header className="je-header">
          <div className="je-brand">Just Exercise</div>
          <div className="je-status">
            <span className={status === "Tracking active!" ? "je-status-dot active" : "je-status-dot"} />
            {status === "Tracking active!" ? "Camera active" : status}
          </div>
        </header>

        <div
          className="je-title je-exercise-header"
          onBlur={event => {
            // Keep the menu open when focus moves between its options.
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setExerciseMenuOpen(false);
            }
          }}
          onKeyDown={event => {
            if (event.key === "Escape") setExerciseMenuOpen(false);
          }}
        >
          <h1>
            Exercise:{" "}
            <button
              type="button"
              className="je-exercise-trigger"
              aria-haspopup="true"
              aria-expanded={exerciseMenuOpen}
              aria-controls="exercise-options"
              onClick={() => setExerciseMenuOpen(open => !open)}
            >
              {exercises[exercise].name}
              <span className="je-exercise-arrow" aria-hidden="true">▾</span>
            </button>
          </h1>
          {exerciseMenuOpen && (
            <div id="exercise-options" className="je-exercise-options" aria-label="Choose exercise">
              {(Object.keys(exercises) as Exercise[]).map(key => (
                <button
                  key={key}
                  type="button"
                  className={key === exercise ? "je-exercise-option is-selected" : "je-exercise-option"}
                  aria-current={key === exercise ? "true" : undefined}
                  onClick={() => changeExercise(key)}
                >
                  {exercises[key].name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="je-workspace">
          <section className="je-camera-section">
            <div className="je-camera">
              <video ref={videoRef} autoPlay muted playsInline className="je-video" />
              <canvas ref={canvasRef} className="je-canvas" role="img" aria-label="Live skeleton tracking" />
            </div>
          </section>

          <section className="je-info">
            <div className="je-instructions-panel">
              <ol className="je-instructions">
                {exercises[exercise].instructions.map((instruction, index) => (
                  <li key={index}>
                    <span className="je-step">{String(index + 1).padStart(2, "0")}</span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
              <div className="je-arm-tracking">
                <div className="je-arm-tracking-list">
                  <div className="je-arm-line">
                    <span className="je-arm-name">Left Arm</span>
                    <span className={leftArmDetected ? "je-arm-state detected" : "je-arm-state"}>
                      <span className="je-arm-dot" />{leftArmDetected ? "Detected" : "Not detected"}
                    </span>
                  </div>
                  <div className="je-arm-line">
                    <span className="je-arm-name">Right Arm</span>
                    <span className={rightArmDetected ? "je-arm-state detected" : "je-arm-state"}>
                      <span className="je-arm-dot" />{rightArmDetected ? "Detected" : "Not detected"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="je-rep-area">
              <div className="je-rep-details">
                <div>
                  <p className="je-rep-label">Completed Reps</p>
                  <div className="je-rep-number" aria-live="polite" aria-atomic="true">{reps}</div>
                </div>
                <button type="button" className="je-reset" onClick={resetCounters}>Reset Counter</button>
              </div>
            </div>
          </section>
        </div>

        <section className={trackingGood ? "je-feedback is-good" : "je-feedback"}>
          <h2>Movement Feedback</h2>
          <div className="je-feedback-content">
            <span className="je-feedback-dot" />
            <p aria-live="polite">{exerciseFeedback}</p>
          </div>
        </section>

        <details className="je-diagnostics">
          <summary>Advanced Measurements</summary>
          <div className="je-measurements">
            <p>Counting stage: <strong>{stageText}</strong></p>
            <p>Left {exercise === "bicep" ? "elbow" : "shoulder"}: <strong>
              {leftAngle === null ? "Not detected" : `${leftAngle.toFixed(0)}°`}
            </strong></p>
            <p>Right {exercise === "bicep" ? "elbow" : "shoulder"}: <strong>
              {rightAngle === null ? "Not detected" : `${rightAngle.toFixed(0)}°`}
            </strong></p>
            {exercise !== "bicep" && <>
              <p>Left elbow extension: <strong>
                {leftElbowAngle === null ? "Not detected" : `${leftElbowAngle.toFixed(0)}°`}
              </strong></p>
              <p>Right elbow extension: <strong>
                {rightElbowAngle === null ? "Not detected" : `${rightElbowAngle.toFixed(0)}°`}
              </strong></p>
              <p>Left {directionLabel} score: <strong>
                {leftDirection === null ? "Not detected" : leftDirection.toFixed(2)}
              </strong></p>
              <p>Right {directionLabel} score: <strong>
                {rightDirection === null ? "Not detected" : rightDirection.toFixed(2)}
              </strong></p>
              {exercise === "front" && <>
                <p>Left sideways score: <strong>{leftOutward === null ? "Not detected" : leftOutward.toFixed(2)}</strong></p>
                <p>Right sideways score: <strong>{rightOutward === null ? "Not detected" : rightOutward.toFixed(2)}</strong></p>
                <p>Left screen travel: <strong>{leftScreenTravel === null ? "Not detected" : leftScreenTravel.toFixed(2)}</strong></p>
                <p>Right screen travel: <strong>{rightScreenTravel === null ? "Not detected" : rightScreenTravel.toFixed(2)}</strong></p>
              </>}
            </>}
          </div>
        </details>
      </div>
    </main>
  );
}
