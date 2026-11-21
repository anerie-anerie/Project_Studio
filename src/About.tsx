export default function About() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-6">
      {/* Overview Banner */}
      <section className="bg-white border border-gray-200 rounded-3xl p-8 md:p-10 shadow-sm">
        <span className="inline-block px-3.5 py-1 rounded-full bg-[#EFEBF9] text-[#4A2E96] text-xs font-bold uppercase tracking-wider mb-3 border border-purple-200">
          ECE198 Engineering Design
        </span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mb-3">
          About The Exercise Tracking Platform
        </h1>
        <p className="text-gray-600 text-base leading-relaxed max-w-3xl">
          An engineering solution developed to bridge the gap between home-based physical therapy and clinical oversight. By combining wearable embedded sensors with web-based computer vision, the platform provides objective, real-time telemetry for patients and physical therapists alike.
        </p>
      </section>

      {/* Problem Space & Core Solution */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-red-100 rounded-2xl p-7 shadow-sm bg-gradient-to-br from-white to-[#FDF4F4]">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-[#B3261E] flex items-center justify-center font-bold text-lg mb-4">
            📖
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">The Problem Space</h2>
          <ul className="space-y-3 text-sm text-gray-600 leading-relaxed list-disc pl-4">
            <li>
              <strong>Unmonitored Home Rehab:</strong> Up to 70% of physical therapy patients perform prescribed home exercises incorrectly without live supervision.
            </li>
            <li>
              <strong>Subjective Tracking:</strong> Traditional self-reporting via paper logs leads to inaccurate repetition counts and unknown movement quality.
            </li>
            <li>
              <strong>Risk of Re-injury:</strong> Poor posture or compensatory arm movements during lifts (e.g., flaring elbows or swinging the torso) can stall recovery or cause secondary strains.
            </li>
          </ul>
        </div>

        <div className="bg-white border border-purple-100 rounded-2xl p-7 shadow-sm bg-gradient-to-br from-white to-[#EFEBF9]/50">
          <div className="w-10 h-10 rounded-xl bg-[#EFEBF9] text-[#6342B3] flex items-center justify-center font-bold text-lg mb-4">
            🎯
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Project Goals</h2>
          <ul className="space-y-3 text-sm text-gray-600 leading-relaxed list-disc pl-4">
            <li>
              <strong>Dual-Sensor Validation:</strong> Isolate repetition counting to dedicated IMU hardware while leveraging vision AI solely for posture and form checks.
            </li>
            <li>
              <strong>Instant Visual Feedback:</strong> Provide patients with explicit guidance on range of motion thresholds (e.g., 55° pitch for raises) in real time.
            </li>
            <li>
              <strong>Therapist Data Logging:</strong> Automatically record completed reps, duration, and session timestamps to a local API for clinical evaluation.
            </li>
          </ul>
        </div>
      </section>

      {/* Technical Architecture Breakdown */}
      <section className="bg-white border border-gray-200 rounded-3xl p-8">
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
          Technical Stack &amp; Architecture
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          How hardware signal processing interacts with browser-based computer vision.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl border border-gray-200 bg-[#FAF9F7]">
            <span className="text-xs font-bold text-[#6342B3] uppercase tracking-wider">01. Hardware Layer</span>
            <h3 className="font-bold text-gray-900 text-base mt-1 mb-2">Arduino IMU Sensor</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Accelerometer &amp; gyroscope telemetry calculates arm angular pitch over Web Serial. Implements digital filtering to eliminate drift and register valid repetitions.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-gray-200 bg-[#FAF9F7]">
            <span className="text-xs font-bold text-[#6342B3] uppercase tracking-wider">02. Computer Vision</span>
            <h3 className="font-bold text-gray-900 text-base mt-1 mb-2">MediaPipe Pose AI</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Tracks 33 spatial body landmarks via GPU acceleration to detect joint angles (shoulder, elbow, wrist, hip) and ensure chest/body alignment during lifts.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-gray-200 bg-[#FAF9F7]">
            <span className="text-xs font-bold text-[#6342B3] uppercase tracking-wider">03. Application Layer</span>
            <h3 className="font-bold text-gray-900 text-base mt-1 mb-2">React &amp; Local API</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Vite-powered single page application rendered in React. Pushes session telemetry to a local Node/Express backend (`localhost:5001`) for patient history logs.
            </p>
          </div>
        </div>
      </section>

      {/* Target Impact Summary */}
      <section className="bg-gradient-to-r from-[#4A2E96] to-[#6342B3] text-white rounded-3xl p-8 shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Designed for Measurable Recovery</h2>
          <p className="text-purple-100 text-sm max-w-2xl leading-relaxed">
            By standardizing motion data collection across Front Raises, Bicep Curls, and Lat Raises, this project demonstrates how low-cost microcontrollers and browser AI can bring clinical-grade tracking to home rehabilitation.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center min-w-[160px]">
          <span className="block text-3xl font-extrabold text-white">ECE 198</span>
          <span className="text-xs text-purple-200 font-semibold uppercase tracking-wider">Engineering Project</span>
        </div>
      </section>
    </div>
  );
}