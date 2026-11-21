import { useState, useEffect, useRef, useCallback } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { connectArduino, type ArduinoConnection, type ArduinoRepReading } from "./lib/arduino";
import {
  type Point3D,
  calculateShoulderAngle,
  calculateElbowAngle,
  calculateTorsoForwardDirection,
  calculateArmForwardScore,
  areLandmarksVisible,
  isForwardRaiseValid,
  isBicepCurlValid,
  isLatRaiseValid,
} from "./lib/exerciseGeometry";
import { LiveRepBoard } from "./components/LiveRepBoard";
import About from "./About";
import Tips from "./Tips";
import QA from "./QA";
import Home from "./Home";

const API_BASE_URL = "http://localhost:5001";

type TabView = "HOME" | "EXERCISE" | "HISTORY" | "ABOUT" | "TIPS" | "QA";
type Screen = "SELECT" | "WORKOUT" | "COMPLETE";
type ExerciseKind = "front-raises" | "bicep-curls" | "lat-raises";

interface ExerciseOption {
  id: string;
  number: 1 | 2 | 3;
  name: string;
  backendExercise: string;
  kind: ExerciseKind;
  description: string;
  shortInstruction: string;
  startPrompt: string;
  repsPerSet: number;
  totalSets: number;
  downAngle: number;
  upAngle: number;
}

const EXERCISES: ExerciseOption[] = [
  {
    id: "front-raises",
    number: 1,
    name: "Front raises",
    backendExercise: "front_raises",
    kind: "front-raises",
    description:
      "Raise your arm straight in front of you to shoulder height, then lower slowly.",
    shortInstruction: "Lift slowly to shoulder height, then lower.",
    startPrompt: "Raise your arm to start!",
    repsPerSet: 10,
    totalSets: 2,
    downAngle: 25,
    upAngle: 55,
  },
  {
    id: "bicep-curls",
    number: 2,
    name: "Bicep curls",
    backendExercise: "bicep_curls",
    kind: "bicep-curls",
    description:
      "Keep your elbows tucked at your sides and curl your hands toward your shoulders, then lower slowly.",
    shortInstruction: "Curl slowly to shoulder height, then extend fully.",
    startPrompt: "Curl your arms to start!",
    repsPerSet: 10,
    totalSets: 2,
    downAngle: 35,
    upAngle: 75,
  },
  {
    id: "lat-raises",
    number: 3,
    name: "Lat raises",
    backendExercise: "lat_raises",
    kind: "lat-raises",
    description:
      "Raise your arms out to your sides up to shoulder height with a slight elbow bend, then lower slowly.",
    shortInstruction: "Raise out to the sides to shoulder height, then lower slowly.",
    startPrompt: "Raise your arms out to start!",
    repsPerSet: 10,
    totalSets: 2,
    downAngle: 25,
    upAngle: 55,
  },
];

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

function ExerciseVisual({
  kind,
  compact = false,
}: {
  kind: ExerciseKind;
  compact?: boolean;
}) {
  const heightClass = compact ? "h-44 mb-2" : "h-56 mb-5";

  if (kind === "bicep-curls") {
    return (
      <div
        className={`w-full ${heightClass} bg-[#F4F1FA] border border-purple-200 rounded-xl flex items-center justify-center px-4`}
      >
        <svg viewBox="0 0 320 170" className="w-full max-w-sm h-full" aria-label="Bicep curl form guide">
          <line x1="20" y1="154" x2="300" y2="154" stroke="#CBD5E1" strokeWidth="2" />
          <circle cx="110" cy="36" r="12" fill="#EDE9FE" stroke="#6342B3" strokeWidth="2.5" />
          <line x1="110" y1="48" x2="110" y2="106" stroke="#4A2E96" strokeWidth="5" strokeLinecap="round" />
          <line x1="110" y1="106" x2="98" y2="154" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
          <line x1="110" y1="106" x2="124" y2="154" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
          <line x1="110" y1="54" x2="110" y2="112" stroke="#94A3B8" strokeWidth="3" strokeDasharray="4 3" />
          <line x1="110" y1="54" x2="112" y2="92" stroke="#6342B3" strokeWidth="4" strokeLinecap="round" />
          <line x1="112" y1="92" x2="146" y2="58" stroke="#6342B3" strokeWidth="4" strokeLinecap="round" />
          <path d="M 118 112 A 34 34 0 0 0 144 62" fill="none" stroke="#7C3AED" strokeWidth="2" strokeDasharray="3 3" />
          <text x="158" y="42" fill="#4A2E96" fontSize="11" fontWeight="700">
            Curl UP (~75° IMU)
          </text>
          <text x="158" y="56" fill="#475569" fontSize="10">
            Elbow stays tucked
          </text>
          <text x="158" y="114" fill="#64748B" fontSize="10">
            Return ≤ 35°
          </text>
        </svg>
      </div>
    );
  }

  if (kind === "lat-raises") {
    return (
      <div
        className={`w-full ${heightClass} bg-[#F4F1FA] border border-purple-200 rounded-xl flex items-center justify-center px-4`}
      >
        <svg viewBox="0 0 320 170" className="w-full max-w-sm h-full" aria-label="Lat raise form guide">
          <line x1="20" y1="154" x2="300" y2="154" stroke="#CBD5E1" strokeWidth="2" />
          <circle cx="160" cy="34" r="12" fill="#EDE9FE" stroke="#6342B3" strokeWidth="2.5" />
          <line x1="160" y1="46" x2="160" y2="106" stroke="#4A2E96" strokeWidth="5" strokeLinecap="round" />
          <line x1="160" y1="106" x2="146" y2="154" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
          <line x1="160" y1="106" x2="174" y2="154" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
          <line x1="160" y1="52" x2="152" y2="104" stroke="#94A3B8" strokeWidth="3" strokeDasharray="4 3" />
          <line x1="160" y1="52" x2="168" y2="104" stroke="#94A3B8" strokeWidth="3" strokeDasharray="4 3" />
          <line x1="160" y1="52" x2="88" y2="52" stroke="#6342B3" strokeWidth="4.5" strokeLinecap="round" />
          <line x1="160" y1="52" x2="232" y2="52" stroke="#6342B3" strokeWidth="4.5" strokeLinecap="round" />
          <text x="160" y="20" textAnchor="middle" fill="#4A2E96" fontSize="11" fontWeight="700">
            Raise Out ≥ 55° IMU
          </text>
          <text x="55" y="72" textAnchor="middle" fill="#475569" fontSize="10">
            Side lift
          </text>
          <text x="265" y="72" textAnchor="middle" fill="#475569" fontSize="10">
            Side lift
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`w-full ${heightClass} bg-[#F4F1FA] border border-purple-200 rounded-xl flex items-center justify-center px-4`}
    >
      <svg viewBox="0 0 320 170" className="w-full max-w-sm h-full" aria-label="Front raise form guide">
        <line x1="20" y1="154" x2="300" y2="154" stroke="#CBD5E1" strokeWidth="2" />
        <circle cx="105" cy="36" r="12" fill="#EDE9FE" stroke="#6342B3" strokeWidth="2.5" />
        <line x1="105" y1="48" x2="105" y2="106" stroke="#4A2E96" strokeWidth="5" strokeLinecap="round" />
        <line x1="105" y1="106" x2="92" y2="154" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
        <line x1="105" y1="106" x2="118" y2="154" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
        <line x1="105" y1="54" x2="105" y2="104" stroke="#94A3B8" strokeWidth="3" strokeDasharray="4 3" />
        <line x1="105" y1="54" x2="178" y2="54" stroke="#6342B3" strokeWidth="4.5" strokeLinecap="round" />
        <line x1="105" y1="54" x2="210" y2="54" stroke="#A78BFA" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M 105 84 A 30 30 0 0 0 135 54" fill="none" stroke="#6342B3" strokeWidth="2" />
        <text x="142" y="42" fill="#4A2E96" fontSize="11" fontWeight="700">
          Raise ≥ 55° IMU
        </text>
        <text x="142" y="72" fill="#475569" fontSize="10">
          Keep arm straight & forward
        </text>
        <text x="115" y="102" fill="#64748B" fontSize="10">
          Return ≤ 25°
        </text>
      </svg>
    </div>
  );
}

function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabView>("EXERCISE");
  const [screen, setScreen] = useState<Screen>("SELECT");
  const [patientName, setPatientName] = useState<string>("");
  const [selectedExercise, setSelectedExercise] = useState<ExerciseOption>(EXERCISES[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncLabel, setSyncLabel] = useState("Ready");

  const sessionIdRef = useRef<string>(createSessionId());
  const prevArduinoRepsRef = useRef<number>(0);
  const totalRepsRef = useRef<number>(0);
  const elapsedSecondsRef = useRef<number>(0);
  const arduinoConnRef = useRef<ArduinoConnection | null>(null);

  const [currentSet, setCurrentSet] = useState(1);
  const [repsInSet, setRepsInSet] = useState(0);
  const [totalReps, setTotalReps] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [feedback, setFeedback] = useState("Connect Arduino to count reps.");
  const [lastAngle, setLastAngle] = useState<number | null>(null);

  // MediaPipe form-only state + refs
  const [formStatus, setFormStatus] = useState<string>("Starting MediaPipe form view...");
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  // Arduino state
  const [arduinoConnected, setArduinoConnected] = useState(false);
  const [arduinoStatus, setArduinoStatus] = useState("Arduino disconnected");
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const selectedExerciseRef = useRef<ExerciseOption>(selectedExercise);
  selectedExerciseRef.current = selectedExercise;

  const activeName = patientName.trim() || "Anonymous Patient";

  const formatDuration = useCallback((secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m} min ${s} s`;
  }, []);

  const drawPurpleSkeleton = useCallback((landmarks?: NormalizedLandmark[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#07050A";
    ctx.fillRect(0, 0, width, height);

    if (!landmarks || landmarks.length === 0) return;

    const toX = (lm: NormalizedLandmark) => (1 - lm.x) * width;
    const toY = (lm: NormalizedLandmark) => lm.y * height;

    ctx.strokeStyle = "#A855F7";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
      const a = landmarks[startIdx];
      const b = landmarks[endIdx];
      if (!a || !b) continue;
      if ((a.visibility ?? 1) < 0.35 || (b.visibility ?? 1) < 0.35) continue;

      ctx.beginPath();
      ctx.moveTo(toX(a), toY(a));
      ctx.lineTo(toX(b), toY(b));
      ctx.stroke();
    }

    const jointIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24];
    for (const idx of jointIndices) {
      const lm = landmarks[idx];
      if (!lm || (lm.visibility ?? 1) < 0.35) continue;

      ctx.beginPath();
      ctx.arc(toX(lm), toY(lm), idx === 0 ? 9 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#E9D5FF";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#9333EA";
      ctx.stroke();
    }
  }, []);

  // MediaPipe evaluates FORM ONLY (does NOT count reps)
  const evaluateFormOnly = useCallback(
    (worldLandmarks: (Point3D & { visibility?: number })[]) => {
      const ex = selectedExerciseRef.current;
      const requiredIndices = [11, 12, 13, 14, 15, 16, 23, 24];

      if (!areLandmarksVisible(worldLandmarks, requiredIndices)) {
        setFormStatus("Show shoulders, elbows, wrists & hips");
        return;
      }

      const lShoulder = worldLandmarks[11];
      const rShoulder = worldLandmarks[12];
      const lElbow = worldLandmarks[13];
      const rElbow = worldLandmarks[14];
      const lWrist = worldLandmarks[15];
      const rWrist = worldLandmarks[16];
      const lHip = worldLandmarks[23];
      const rHip = worldLandmarks[24];

      const leftShoulderAngle = calculateShoulderAngle(lHip, lShoulder, lElbow);
      const rightShoulderAngle = calculateShoulderAngle(rHip, rShoulder, rElbow);

      if (ex.kind === "front-raises") {
        const forwardDir = calculateTorsoForwardDirection(worldLandmarks);
        const lForward = forwardDir
          ? calculateArmForwardScore(lShoulder, lElbow, forwardDir)
          : null;
        const rForward = forwardDir
          ? calculateArmForwardScore(rShoulder, rElbow, forwardDir)
          : null;

        setFormStatus(
          isForwardRaiseValid(leftShoulderAngle, lForward) &&
            isForwardRaiseValid(rightShoulderAngle, rForward)
            ? "Form check: Good front raise alignment"
            : "Form check: Raise arms forward"
        );
      } else if (ex.kind === "bicep-curls") {
        const leftElbowAngle = calculateElbowAngle(lShoulder, lElbow, lWrist);
        const rightElbowAngle = calculateElbowAngle(rShoulder, rElbow, rWrist);

        setFormStatus(
          isBicepCurlValid(leftShoulderAngle, leftElbowAngle) &&
            isBicepCurlValid(rightShoulderAngle, rightElbowAngle)
            ? "Form check: Good elbow tuck"
            : "Form check: Keep elbows tucked"
        );
      } else if (ex.kind === "lat-raises") {
        const forwardDir = calculateTorsoForwardDirection(worldLandmarks);
        const lForward = forwardDir
          ? calculateArmForwardScore(lShoulder, lElbow, forwardDir)
          : null;
        const rForward = forwardDir
          ? calculateArmForwardScore(rShoulder, rElbow, forwardDir)
          : null;

        setFormStatus(
          isLatRaiseValid(leftShoulderAngle, lForward) &&
            isLatRaiseValid(rightShoulderAngle, rForward)
            ? "Form check: Good lateral lift alignment"
            : "Form check: Raise arms out to sides"
        );
      }
    },
    []
  );

  const ensurePoseLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    setFormStatus("Loading MediaPipe Pose...");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    landmarkerRef.current = landmarker;
    setFormStatus("MediaPipe form view ready");
    return landmarker;
  }, []);

  const stopPoseLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const stopWebcamAndForm = useCallback(() => {
    stopPoseLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    lastVideoTimeRef.current = -1;
    drawPurpleSkeleton(undefined);
  }, [drawPurpleSkeleton, stopPoseLoop]);

  const startWebcamAndForm = useCallback(async () => {
    setWebcamError(null);
    drawPurpleSkeleton(undefined);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setWebcamError("Camera API unavailable in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const landmarker = await ensurePoseLandmarker();
      stopPoseLoop();

      const tick = () => {
        const video = videoRef.current;
        if (
          video &&
          video.readyState >= 2 &&
          video.currentTime !== lastVideoTimeRef.current
        ) {
          lastVideoTimeRef.current = video.currentTime;
          const nowMs = performance.now();
          const result = landmarker.detectForVideo(video, nowMs);

          if (result.landmarks && result.landmarks[0]) {
            drawPurpleSkeleton(result.landmarks[0]);
          } else {
            drawPurpleSkeleton(undefined);
          }

          if (result.worldLandmarks && result.worldLandmarks[0]) {
            evaluateFormOnly(result.worldLandmarks[0]);
          } else {
            setFormStatus("No person detected");
          }
        }
        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setWebcamError(
        err instanceof Error ? `${err.name}: ${err.message}` : "Unable to start camera."
      );
    }
  }, [drawPurpleSkeleton, ensurePoseLandmarker, evaluateFormOnly, stopPoseLoop]);

  // Sends reps + time taken to backend for the physiotherapist and measures send duration
  const sendSessionUpdate = useCallback(
    async (
      sessionId: string,
      name: string,
      exercise: string,
      reps: number,
      durationSec: number,
      status: "active" | "completed"
    ) => {
      const startedAtMs = performance.now();
      try {
        const res = await fetch(`${API_BASE_URL}/api/reps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            patientName: name,
            userName: name,
            exercise,
            reps,
            elapsedSeconds: durationSec,
            durationFormatted: formatDuration(durationSec),
            status,
            endedAt: status === "completed" ? new Date().toISOString() : null,
          }),
        });
        const sendTimeMs = Math.round(performance.now() - startedAtMs);
        setSyncLabel(
          res.ok
            ? `Sent ${reps} reps in ${sendTimeMs}ms (${formatDuration(durationSec)})`
            : `Error ${res.status} (${sendTimeMs}ms)`
        );
      } catch {
        const sendTimeMs = Math.round(performance.now() - startedAtMs);
        setSyncLabel(`localhost:5001 offline (${sendTimeMs}ms)`);
      }
    },
    [formatDuration]
  );

  // Pure state update outside React StrictMode updater so reps never double-count
  const addArduinoReps = useCallback(
    (delta: number) => {
      if (delta <= 0) return;
      const ex = selectedExerciseRef.current;
      const goalTotal = ex.repsPerSet * ex.totalSets;

      const nextTotal = Math.min(goalTotal, totalRepsRef.current + delta);
      const actualAdded = nextTotal - totalRepsRef.current;
      if (actualAdded <= 0) return;

      totalRepsRef.current = nextTotal;
      setTotalReps(nextTotal);

      const isCompleted = nextTotal >= goalTotal;
      const durationNow = elapsedSecondsRef.current;

      void sendSessionUpdate(
        sessionIdRef.current,
        activeName,
        ex.backendExercise,
        nextTotal,
        durationNow,
        isCompleted ? "completed" : "active"
      );

      const nextSet = Math.min(
        ex.totalSets,
        Math.floor(nextTotal / ex.repsPerSet) + (nextTotal % ex.repsPerSet === 0 && nextTotal > 0 ? 0 : 1)
      );
      const nextRepsInSet = isCompleted ? ex.repsPerSet : nextTotal % ex.repsPerSet;

      setCurrentSet(isCompleted ? ex.totalSets : Math.max(1, nextSet));
      setRepsInSet(nextRepsInSet);

      if (isCompleted) {
        stopWebcamAndForm();
        setScreen("COMPLETE");
      }
    },
    [activeName, sendSessionUpdate, stopWebcamAndForm]
  );

  const handleArduinoReading = useCallback(
    (reading: ArduinoRepReading) => {
      setLastAngle(Math.round(reading.angle));

      if (reading.reps < prevArduinoRepsRef.current) {
        prevArduinoRepsRef.current = reading.reps;
        return;
      }

      const delta = reading.reps - prevArduinoRepsRef.current;
      if (delta > 0) {
        prevArduinoRepsRef.current = reading.reps;
        addArduinoReps(delta);
      }
    },
    [addArduinoReps]
  );

  const handleConnectArduino = useCallback(async () => {
    if (arduinoConnRef.current) {
      await arduinoConnRef.current.disconnect();
      arduinoConnRef.current = null;
      setArduinoConnected(false);
      setArduinoStatus("Arduino disconnected");
      return;
    }

    const conn = await connectArduino(
      (status) => setArduinoStatus(status),
      handleArduinoReading,
    );
    if (conn) {
      arduinoConnRef.current = conn;
      setArduinoConnected(true);
      await conn.sendExerciseCode(selectedExerciseRef.current.number);
    } else {
      setArduinoConnected(false);
    }
  }, [handleArduinoReading]);

  useEffect(() => {
    return () => {
      stopWebcamAndForm();
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      if (arduinoConnRef.current) {
        void arduinoConnRef.current.disconnect();
        arduinoConnRef.current = null;
      }
    };
  }, [stopWebcamAndForm]);

  const formatClock = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const startWorkout = (exercise: ExerciseOption) => {
    const newId = createSessionId();
    sessionIdRef.current = newId;
    prevArduinoRepsRef.current = 0;
    totalRepsRef.current = 0;
    elapsedSecondsRef.current = 0;

    setActiveTab("EXERCISE");
    setSelectedExercise(exercise);
    setLastAngle(0);
    setCurrentSet(1);
    setRepsInSet(0);
    setTotalReps(0);
    setElapsedSeconds(0);
    setCountdown(3);
    setFeedback("Start slowly and focus on form.");
    setScreen("WORKOUT");

    if (arduinoConnRef.current) {
      void arduinoConnRef.current.sendExerciseCode(exercise.number);
    }
    void startWebcamAndForm();
    void sendSessionUpdate(newId, activeName, exercise.backendExercise, 0, 0, "active");
  };

  useEffect(() => {
    if (activeTab !== "EXERCISE" || screen !== "WORKOUT" || emergencyOpen) return;

    const timer = setInterval(() => {
      if (countdown !== null && countdown > 0) {
        setCountdown((c) => (c !== null ? c - 1 : null));
      } else {
        setElapsedSeconds((t) => {
          const next = t + 1;
          elapsedSecondsRef.current = next;
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTab, screen, countdown, emergencyOpen]);

  useEffect(() => {
    const ratio = repsInSet / selectedExercise.repsPerSet;
    if (repsInSet === 0) {
      setFeedback("Start slowly and focus on form.");
    } else if (ratio < 0.6) {
      setFeedback("Great pace! Keep going.");
    } else {
      setFeedback("Almost there, keep going!");
    }
  }, [repsInSet, selectedExercise.repsPerSet]);

  const handleExit = () => {
    void sendSessionUpdate(
      sessionIdRef.current,
      activeName,
      selectedExercise.backendExercise,
      totalRepsRef.current,
      elapsedSecondsRef.current,
      "completed"
    );
    stopWebcamAndForm();
    setScreen("SELECT");
  };

  const handleNextExercise = () => {
    const idx = EXERCISES.findIndex((e) => e.id === selectedExercise.id);
    startWorkout(EXERCISES[(idx + 1) % EXERCISES.length]);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F7] text-[#1C1B1F] font-sans">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      <header className="bg-white border-b border-gray-200 px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <button
            onClick={() => {
              stopWebcamAndForm();
              setScreen("SELECT");
              setActiveTab("EXERCISE");
            }}
            className="text-xl font-extrabold tracking-tight text-black"
          >
            Just Exercise!
          </button>

          <nav className="hidden md:flex items-center gap-2 text-sm font-medium text-gray-700">
            <button
              onClick={() => {
                stopWebcamAndForm();
                setActiveTab("HOME");
              }}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "HOME"
                  ? "bg-[#EFEBF9] text-[#5B3BB2] font-semibold"
                  : "hover:bg-gray-100"
              }`}
            >
              Home
            </button>

            <button
              onClick={() => {
                stopWebcamAndForm();
                setScreen("SELECT");
                setActiveTab("EXERCISE");
              }}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "EXERCISE"
                  ? "bg-[#EFEBF9] text-[#5B3BB2] font-semibold"
                  : "hover:bg-gray-100"
              }`}
            >
              Exercise!
            </button>

            <button
              onClick={() => {
                stopWebcamAndForm();
                setActiveTab("HISTORY");
              }}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "HISTORY"
                  ? "bg-[#EFEBF9] text-[#5B3BB2] font-semibold"
                  : "hover:bg-gray-100"
              }`}
            >
              History
            </button>

            <button
              onClick={() => {
                stopWebcamAndForm();
                setActiveTab("TIPS");
              }}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "TIPS"
                  ? "bg-[#EFEBF9] text-[#5B3BB2] font-semibold"
                  : "hover:bg-gray-100"
              }`}
            >
              Tips
            </button>

            <button
              onClick={() => {
                stopWebcamAndForm();
                setActiveTab("QA");
              }}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "QA"
                  ? "bg-[#EFEBF9] text-[#5B3BB2] font-semibold"
                  : "hover:bg-gray-100"
              }`}
            >
              Q&A
            </button>

            <button
              onClick={() => {
                stopWebcamAndForm();
                setActiveTab("ABOUT");
              }}
              className={`px-4 py-1.5 rounded-full transition ${
                activeTab === "ABOUT"
                  ? "bg-[#EFEBF9] text-[#5B3BB2] font-semibold"
                  : "hover:bg-gray-100"
              }`}
            >
              About
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleConnectArduino()}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
              arduinoConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-[#EFEBF9] text-[#4A2E96] border-purple-200 hover:bg-purple-100"
            }`}
          >
            {arduinoConnected ? "Arduino Connected" : "Connect Arduino"}
          </button>
          <span className="text-xs text-gray-500 hidden sm:inline">{syncLabel}</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-48 px-4 py-1.5 text-sm bg-[#F5F4F2] border border-gray-200 rounded-full focus:outline-none focus:border-[#6342B3]"
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {activeTab === "HOME" ? (
        <Home
          onStartExercise={() => {
            stopWebcamAndForm();
            setScreen("SELECT");
            setActiveTab("EXERCISE");
          }}
          onViewHistory={() => {
            stopWebcamAndForm();
            setActiveTab("HISTORY");
          }}
        />
      ) :activeTab === "QA" ? (
          <div>
            <button
              onClick={() => setActiveTab("EXERCISE")}
              className="text-sm text-[#6342B3] underline mb-4 inline-block"
            >
              ← Back to exercises
            </button>
            <QA />
          </div>
        ) :activeTab === "TIPS" ? (
          <div>
            <button
              onClick={() => setActiveTab("EXERCISE")}
              className="text-sm text-[#6342B3] underline mb-4 inline-block"
            >
              ← Back to exercises
            </button>
            <Tips />
          </div>
        ) :activeTab === "ABOUT" ? (
          <div>
            <button
              onClick={() => setActiveTab("EXERCISE")}
              className="text-sm text-[#6342B3] underline mb-4 inline-block"
            >
              ← Back to exercises
            </button>
            <About />
          </div>
        ) : activeTab === "HISTORY" ? (
          <div>
            <button
              onClick={() => setActiveTab("EXERCISE")}
              className="text-sm text-[#6342B3] underline mb-4 inline-block"
            >
              ← Back to exercises
            </button>

            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div>
                <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
                  Your Session History
                </h1>
                <p className="text-gray-600 mt-1">
                  Filtered by your name so you only see your own recorded sessions.
                </p>
              </div>

              <div className="w-full sm:w-64">
                <label
                  htmlFor="history-name-filter"
                  className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1"
                >
                  Patient Name
                </label>
                <input
                  id="history-name-filter"
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:border-[#6342B3]"
                />
              </div>
            </div>

            <LiveRepBoard patientName={patientName} />
          </div>
        ) : (
          <>
            {screen === "SELECT" && (
              <div>
                <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
                  Let's start exercising!
                </h1>
                <p className="text-gray-600 mt-1 mb-5">
                  Enter your name first, then pick an exercise:
                </p>

                <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 max-w-md">
                  <label
                    htmlFor="patient-name"
                    className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                  >
                    Your Name (Patient)
                  </label>
                  <input
                    id="patient-name"
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Enter your name..."
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF9F7] border border-gray-300 rounded-xl focus:outline-none focus:border-[#6342B3]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  <div className="md:col-span-5 space-y-3">
                    {EXERCISES.filter((ex) =>
                      ex.name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).map((exercise) => {
                      const active = selectedExercise.id === exercise.id;
                      return (
                        <button
                          key={exercise.id}
                          onClick={() => setSelectedExercise(exercise)}
                          className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border text-left transition ${
                            active
                              ? "bg-[#EFEBF9] border-[#6342B3] ring-1 ring-[#6342B3]"
                              : "bg-white border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                              active ? "bg-[#6342B3] text-white" : "bg-[#EAE8E4] text-gray-700"
                            }`}
                          >
                            {exercise.number}
                          </span>
                          <span
                            className={`font-semibold ${
                              active ? "text-[#4A2E96]" : "text-gray-800"
                            }`}
                          >
                            {exercise.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="md:col-span-7 bg-white border border-gray-200 rounded-2xl p-6">
                    <ExerciseVisual kind={selectedExercise.kind} />

                    <h2 className="text-2xl font-extrabold text-gray-900">
                      {selectedExercise.name}
                    </h2>
                    <p className="text-gray-600 text-sm mt-1.5 mb-6 leading-relaxed">
                      {selectedExercise.description}
                    </p>

                    <button
                      onClick={() => startWorkout(selectedExercise)}
                      className="w-full py-3.5 bg-[#6342B3] hover:bg-[#52349B] text-white font-bold rounded-xl transition cursor-pointer"
                    >
                      Choose this exercise
                    </button>
                  </div>
                </div>
              </div>
            )}

            {screen === "WORKOUT" && (
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                  <div>
                    <h1 className="text-3xl font-extrabold text-gray-900">
                      Exercise {selectedExercise.number}: {selectedExercise.name}
                    </h1>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Patient: <strong className="text-gray-900">{activeName}</strong> • Total
                      Session Reps: <strong className="text-[#6342B3]">{totalReps}</strong> •{" "}
                      <span>{arduinoStatus}</span>
                    </p>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    Set {currentSet} of {selectedExercise.totalSets}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-5">
                  <div className="md:col-span-8 bg-[#07050A] text-white rounded-2xl relative overflow-hidden min-h-[270px] border border-[#281E38]">
                    <canvas
                      ref={canvasRef}
                      width={640}
                      height={360}
                      className="w-full h-full object-cover block"
                    />

                    <div className="absolute inset-0 p-6 flex flex-col justify-between pointer-events-none bg-gradient-to-b from-black/55 via-transparent to-black/65">
                      <div className="flex items-center justify-between text-xs text-purple-200">
                        <span>{webcamError ?? formStatus}</span>
                        <span>
                          {arduinoConnected && lastAngle !== null
                            ? `IMU Angle: ${lastAngle}°`
                            : arduinoStatus}
                        </span>
                      </div>

                      <div className="text-center my-auto">
                        <p className="text-xs text-purple-300/90 mb-1.5">
                          {countdown !== null && countdown > 0
                            ? `Starting in ${countdown}...`
                            : "MediaPipe Form View • Arduino Rep Counter"}
                        </p>
                        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white drop-shadow">
                          {selectedExercise.startPrompt}
                        </h2>
                      </div>

                      <p className="text-xs text-purple-200/90">
                        {selectedExercise.shortInstruction}
                      </p>
                    </div>
                  </div>

                  <div className="md:col-span-4 bg-white border border-gray-200 rounded-2xl p-4 flex flex-col justify-between min-h-[270px]">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#6342B3] mb-1">
                      <span>Form Demo</span>
                      <span className="text-gray-500 font-semibold normal-case">
                        {arduinoConnected ? "IMU Active" : "IMU Off"}
                      </span>
                    </div>

                    <ExerciseVisual kind={selectedExercise.kind} compact />

                    <button
                      onClick={() => void handleConnectArduino()}
                      className="w-full py-2 mt-1 rounded-xl text-xs font-bold bg-[#EFEBF9] text-[#4A2E96] hover:bg-purple-100 border border-purple-200 cursor-pointer"
                    >
                      {arduinoConnected ? "Disconnect Arduino" : "Connect Arduino"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  <div className="md:col-span-5 bg-white border border-gray-200 rounded-2xl p-5 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3">Statistics</h3>
                      <div className="flex items-end gap-8">
                        <div>
                          <p className="text-xs text-gray-500">Reps</p>
                          <p className="text-4xl font-extrabold text-[#6342B3]">
                            {repsInSet}{" "}
                            <span className="text-lg font-bold text-gray-700">
                              / {selectedExercise.repsPerSet}
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Time</p>
                          <p className="text-2xl font-extrabold text-gray-900">
                            {formatClock(elapsedSeconds)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs text-gray-500 mb-1.5">Progress to goal</p>
                      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#6342B3] transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              100,
                              (repsInSet / selectedExercise.repsPerSet) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-4 bg-[#FDF4F4] border border-red-100 rounded-2xl p-5 flex flex-col justify-between">
                    <h3 className="font-bold text-gray-900 mb-3">Not feeling good?</h3>
                    <div className="space-y-2.5">
                      <button
                        onClick={handleExit}
                        className="w-full py-2.5 bg-white hover:bg-gray-50 border border-gray-800 rounded-xl font-bold text-sm text-gray-900"
                      >
                        Exit exercise
                      </button>
                      <button
                        onClick={() => setEmergencyOpen(true)}
                        className="w-full py-2.5 bg-[#B3261E] hover:bg-[#961E18] text-white rounded-xl font-bold text-sm"
                      >
                        Emergency stop
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-3 leading-snug">
                      Stops right away and shows your doctor's contact. In an emergency, call
                      911.
                    </p>
                  </div>

                  <div className="md:col-span-3 bg-[#EFEBF9] border border-purple-100 rounded-2xl p-5">
                    <h3 className="font-bold text-[#6342B3] text-sm mb-2">Feedback</h3>
                    <p className="text-xl font-extrabold text-gray-900 leading-snug">
                      {feedback}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {screen === "COMPLETE" && (
              <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center max-w-3xl mx-auto">
                <p className="text-sm text-gray-600 mb-2">
                  Exercise {selectedExercise.number}: {selectedExercise.name} • {activeName}
                </p>
                <h1 className="text-5xl font-extrabold text-[#4A2E96] tracking-tight mb-3">
                  Congratulations!
                </h1>
                <p className="text-lg text-gray-800 mb-8">
                  You did <span className="font-bold">{totalReps} reps</span> in{" "}
                  <span className="font-bold">{formatDuration(elapsedSeconds)}</span>
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => startWorkout(selectedExercise)}
                    className="px-6 py-3 rounded-xl border border-[#6342B3] text-[#4A2E96] font-bold text-sm"
                  >
                    Try again
                  </button>
                  <button
                    onClick={handleNextExercise}
                    className="px-7 py-3 rounded-xl bg-[#6342B3] text-white font-bold text-sm"
                  >
                    Next exercise
                  </button>
                  <button
                    onClick={() => {
                      setScreen("SELECT");
                      setActiveTab("HISTORY");
                    }}
                    className="px-6 py-3 rounded-xl border border-[#6342B3] text-[#4A2E96] font-bold text-sm"
                  >
                    View History
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {emergencyOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border-2 border-[#B3261E]">
            <h2 className="text-2xl font-extrabold text-[#B3261E] mb-2">
              Workout Paused — Emergency Stop
            </h2>
            <p className="text-sm text-gray-700 mb-4">
              Stop exercising immediately, sit down, and rest. In an emergency, call{" "}
              <strong>911</strong>.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEmergencyOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold"
              >
                Resume
              </button>
              <button
                onClick={() => {
                  setEmergencyOpen(false);
                  handleExit();
                }}
                className="px-4 py-2 rounded-xl bg-[#B3261E] text-white text-sm font-bold"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}