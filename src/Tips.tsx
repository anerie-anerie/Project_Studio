export default function Tips() {
  const tips = [
    {
      title: "Camera & Position Setup",
      desc: "Place your device at chest height, about 5–8 feet away. Make sure your torso, shoulders, elbows, and wrists are fully visible for MediaPipe tracking.",
    },
    {
      title: "Arduino IMU Placement",
      desc: "Secure the sensor tightly on your forearm or arm. Avoid sudden jerking motions to allow precise angle measurement.",
    },
    {
      title: "Front & Lat Raise Control",
      desc: "Raise your arms smoothly to shoulder height (~55°). Avoid swinging your upper body—control the movement on the way down.",
    },
    {
      title: "Bicep Curl Execution",
      desc: "Keep your elbows pinned at your sides throughout the movement. Curl up until reaching ~75° before fully extending down.",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
          Exercise & System Tips
        </h1>
        <p className="text-gray-600 mt-2">
          Best practices for optimal MediaPipe vision tracking and Arduino rep counting.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {tips.map((item, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#4A2E96] mb-2">{item.title}</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}