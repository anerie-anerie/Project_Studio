import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "How does rep counting work?",
    answer:
      "Repetitions are tracked via telemetry streaming from the Arduino IMU sensor. The sensor measures joint angles during movements and logs a completed rep when full range-of-motion thresholds are met.",
  },
  {
    question: "What is MediaPipe doing on the workout screen?",
    answer:
      "MediaPipe Pose tracks keypoints (shoulders, elbows, wrists, hips) using your webcam to evaluate movement alignment and posture in real time. It provides form guidance while the Arduino counts reps.",
  },
  {
    question: "How do I connect the Arduino sensor?",
    answer:
      "Click the 'Connect Arduino' button in the top right header navigation. Choose your device's USB serial port from the browser popup dialog to initiate data streaming.",
  },
  {
    question: "Where are my workout records saved?",
    answer:
      "Completed reps, session durations, and patient metrics are automatically transmitted to the local API server and stored in your session history view.",
  },
];

export default function QA() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
          Questions & Answers
        </h1>
        <p className="text-gray-600 mt-2">
          Common technical and operational questions regarding the Exercise Tracker.
        </p>
      </div>

      <div className="space-y-4">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden transition shadow-sm"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full flex items-center justify-between p-5 text-left font-bold text-gray-900 hover:bg-gray-50 transition"
              >
                <span>{faq.question}</span>
                <span className="text-[#6342B3] text-xl font-bold ml-4">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}