import { useEffect, useState } from "react";

type SessionRecord = {
  id?: string;
  sessionId: string;
  patientName: string;
  exercise?: string;
  reps: number;
  elapsedSeconds?: number;
  durationFormatted?: string;
  status: "active" | "completed";
  sessionDate: string;
  startedAt: string | null;
  endedAt: string | null;
};

const API_BASE_URL = "http://localhost:5001";

interface LiveRepBoardProps {
  patientName: string;
}

function formatDurationSeconds(totalSecs: number): string {
  const safeSecs = Math.max(0, Math.floor(totalSecs));
  const m = Math.floor(safeSecs / 60);
  const s = safeSecs % 60;
  return `${m} min ${s} s`;
}

function getTimeTakenLabel(item: SessionRecord): string {
  if (item.durationFormatted && item.durationFormatted.trim()) {
    return item.durationFormatted;
  }
  if (typeof item.elapsedSeconds === "number" && !Number.isNaN(item.elapsedSeconds)) {
    return formatDurationSeconds(item.elapsedSeconds);
  }
  if (item.startedAt && item.endedAt) {
    const startMs = Date.parse(item.startedAt);
    const endMs = Date.parse(item.endedAt);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      return formatDurationSeconds((endMs - startMs) / 1000);
    }
  }
  return "—";
}

export function LiveRepBoard({ patientName }: LiveRepBoardProps) {
  const [records, setRecords] = useState<SessionRecord[]>([]);
  const [connectionState, setConnectionState] = useState<"live" | "offline">("live");

  const normalizedQuery = patientName.trim().toLowerCase();

  useEffect(() => {
    async function fetchReps() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/reps`);
        if (res.ok) {
          setRecords(await res.json());
          setConnectionState("live");
        }
      } catch (err) {
        setConnectionState("offline");
        console.error("Error fetching sessions:", err);
      }
    }

    void fetchReps();
    const interval = setInterval(() => void fetchReps(), 1500);
    return () => clearInterval(interval);
  }, []);

  const filteredRecords = normalizedQuery
    ? records.filter(
        (item) => (item.patientName ?? "").trim().toLowerCase() === normalizedQuery
      )
    : [];

  return (
    <section className="je-feedback bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">
            Physiotherapist Session Log
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {normalizedQuery
              ? `Showing records for "${patientName.trim()}" • localhost:5001/api/reps`
              : "Enter your name to view your personal session history"}
          </p>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            connectionState === "live"
              ? "bg-[#EFEBF9] text-[#4A2E96]"
              : "bg-[#FDF4F4] text-[#B3261E]"
          }`}
        >
          {connectionState === "live" ? "Live Sync" : "Server Offline"}
        </span>
      </div>

      {!normalizedQuery ? (
        <div className="bg-[#FAF9F7] border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-600">
          No patient name entered yet. Add your name on the Exercise tab to filter your history.
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-[#FAF9F7] border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-600">
          No sessions recorded for <strong>{patientName.trim()}</strong> yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                <th className="py-2.5 px-3">Patient</th>
                <th className="py-2.5 px-3">Exercise</th>
                <th className="py-2.5 px-3">Reps</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.map((item) => (
                <tr key={item.sessionId} className="hover:bg-[#FAF9F7] transition">
                  <td className="py-3 px-3 font-bold text-gray-900">
                    {item.patientName}
                  </td>
                  <td className="py-3 px-3 text-gray-700 capitalize">
                    {(item.exercise ?? "front_raises").replace(/_/g, " ")}
                  </td>
                  <td className="py-3 px-3 font-extrabold text-[#6342B3]">
                    {item.reps}
                  </td>
                  <td className="py-3 px-3 font-medium text-gray-800">
                    {getTimeTakenLabel(item)}
                  </td>
                  <td className="py-3 px-3 text-gray-700">{item.sessionDate}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        item.status === "completed"
                          ? "bg-[#EFEBF9] text-[#4A2E96]"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {item.status === "completed" ? "Completed" : "Active"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}