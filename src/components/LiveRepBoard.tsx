import { useEffect, useState } from "react";

type SessionRecord = {
  id: string;
  sessionId: string;
  patientName: string;
  exercise: string;
  reps: number;
  status: "active" | "completed";
  sessionDate: string;
  startedAt: string | null;
  endedAt: string | null;
};

const API_BASE_URL = "http://localhost:5001";

export function LiveRepBoard() {
  const [records, setRecords] = useState<SessionRecord[]>([]);

  useEffect(() => {
    async function fetchReps() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/reps`);
        if (res.ok) {
          setRecords(await res.json());
        }
      } catch (err) {
        console.error("Error fetching sessions:", err);
      }
    }

    void fetchReps();
    const interval = setInterval(() => void fetchReps(), 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="je-feedback" style={{ marginTop: "1rem" }}>
      <h2>Physiotherapist Session Log</h2>
      {records.length === 0 ? (
        <p>No patient sessions recorded yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ padding: "0.4rem" }}>Patient</th>
              <th style={{ padding: "0.4rem" }}>Reps</th>
              <th style={{ padding: "0.4rem" }}>Date</th>
              <th style={{ padding: "0.4rem" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((item) => (
              <tr key={item.sessionId}>
                <td style={{ padding: "0.4rem" }}>
                  <strong>{item.patientName}</strong>
                </td>
                <td style={{ padding: "0.4rem" }}>{item.reps}</td>
                <td style={{ padding: "0.4rem" }}>{item.sessionDate}</td>
                <td style={{ padding: "0.4rem" }}>
                  {item.status === "completed" ? "Completed" : "Active"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}