interface HomeProps {
  onStartExercise: () => void;
  onViewHistory: () => void;
}

export default function Home({ onStartExercise, onViewHistory }: HomeProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-6">
      {/* Hero Banner */}
      <section className="bg-gradient-to-br from-white via-[#FAF9F7] to-[#EFEBF9] border border-purple-200 rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden">
        <div className="max-w-2xl relative z-10">
          <span className="inline-block px-3.5 py-1 rounded-full bg-[#EFEBF9] text-[#4A2E96] text-xs font-bold uppercase tracking-wider mb-4 border border-purple-200">
            ECE198 Engineering Design Project
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight mb-4">
            Smart Motion Tracking &amp; Physical Rehabilitation
          </h1>
          <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-8">
            A dual-technology exercise tracking platform combining <strong>Arduino IMU hardware sensors</strong> for precise repetition counting with <strong>MediaPipe Vision AI</strong> for real-time posture evaluation.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={onStartExercise}
              className="px-7 py-3.5 bg-[#6342B3] hover:bg-[#52349B] text-white font-bold rounded-xl transition shadow-md cursor-pointer text-sm"
            >
              Start Workout Session →
            </button>
            <button
              onClick={onViewHistory}
              className="px-6 py-3.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-800 font-bold rounded-xl transition cursor-pointer text-sm"
            >
              View Session History
            </button>
          </div>
        </div>
      </section>

      {/* System Architecture Grid */}
      <section>
        <div className="text-center max-w-xl mx-auto mb-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
            How The System Works
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            Integrating embedded hardware telemetry with computer vision for accurate patient monitoring.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:border-purple-300 transition">
            <div className="w-12 h-12 rounded-xl bg-[#EFEBF9] text-[#6342B3] flex items-center justify-center font-bold text-xl mb-4">
              ⚡
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Arduino IMU Sensing</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Real-time accelerometer and gyroscope data stream over serial to calculate exact arm angles and register rep counts automatically.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:border-purple-300 transition">
            <div className="w-12 h-12 rounded-xl bg-[#EFEBF9] text-[#6342B3] flex items-center justify-center font-bold text-xl mb-4">
              👁️
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">MediaPipe Vision AI</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Webcam pose detection tracks key upper-body landmarks (shoulders, elbows, wrists) to verify proper alignment and posture during exercise.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:border-purple-300 transition">
            <div className="w-12 h-12 rounded-xl bg-[#EFEBF9] text-[#6342B3] flex items-center justify-center font-bold text-xl mb-4">
              📊
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Therapist Telemetry</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Session completion metrics, elapsed time, and repetition data automatically push to a local backend API for progress tracking.
            </p>
          </div>
        </div>
      </section>

      {/* Supported Exercises Modules */}
      <section className="bg-white border border-gray-200 rounded-3xl p-8">
        <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
          Supported Exercise Modules
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Pre-programmed targeted angles for upper-body physical therapy recovery.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-purple-100 bg-[#FAF9F7]">
            <span className="text-xs font-bold text-[#6342B3] uppercase tracking-wider">Exercise 01</span>
            <h4 className="font-bold text-gray-900 text-base mt-1">Front Raises</h4>
            <p className="text-xs text-gray-500 mt-1 leading-snug">
              Target angle: 25° to 55° IMU pitch for anterior deltoid strengthening.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-purple-100 bg-[#FAF9F7]">
            <span className="text-xs font-bold text-[#6342B3] uppercase tracking-wider">Exercise 02</span>
            <h4 className="font-bold text-gray-900 text-base mt-1">Bicep Curls</h4>
            <p className="text-xs text-gray-500 mt-1 leading-snug">
              Target angle: 35° to 75° IMU pitch with enforced elbow tucking checks.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-purple-100 bg-[#FAF9F7]">
            <span className="text-xs font-bold text-[#6342B3] uppercase tracking-wider">Exercise 03</span>
            <h4 className="font-bold text-gray-900 text-base mt-1">Lat Raises</h4>
            <p className="text-xs text-gray-500 mt-1 leading-snug">
              Target angle: 25° to 55° IMU pitch for lateral shoulder abduction.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}