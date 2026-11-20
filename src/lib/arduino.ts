export interface ArduinoRepReading {
  angle: number;
  reps: number;
}

export interface ArduinoConnection {
  sendExerciseCode: (code: 1 | 2 | 3) => Promise<void>;
  disconnect: () => Promise<void>;
}

const EXERCISE_SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
const EXERCISE_CHAR_UUID = "19b10001-e8f2-537e-4f6c-d104768a1214";
const TELEMETRY_CHAR_UUID = "19b10002-e8f2-537e-4f6c-d104768a1214";

export async function connectArduino(
  onStatusUpdate: (status: string) => void,
  onRepData: (reading: ArduinoRepReading) => void
): Promise<ArduinoConnection | null> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (options: {
        filters?: { name?: string; services?: string[] }[];
        optionalServices?: string[];
      }) => Promise<any>;
    };
  };

  if (!nav.bluetooth) {
    onStatusUpdate("Web Bluetooth requires Chrome or Edge on localhost/HTTPS.");
    return null;
  }

  let device: any;
  try {
    device = await nav.bluetooth.requestDevice({
      filters: [{ name: "JustExercise-IMU" }],
      optionalServices: [EXERCISE_SERVICE_UUID],
    });
  } catch (err) {
    onStatusUpdate(
      err instanceof Error && err.name === "NotFoundError"
        ? "No BLE device selected."
        : `BLE scan failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }

  try {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(EXERCISE_SERVICE_UUID);
    const exerciseChar = await service.getCharacteristic(EXERCISE_CHAR_UUID);
    const telemetryChar = await service.getCharacteristic(TELEMETRY_CHAR_UUID);

    const handleNotification = (event: { target: { value: DataView } }) => {
      const text = new TextDecoder().decode(event.target.value).trim();
      if (!text) return;

      const parts = text.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        onRepData({ angle: parts[0], reps: Math.max(0, Math.floor(parts[1])) });
      } else if (parts.length === 1 && !isNaN(parts[0])) {
        onRepData({ angle: 0, reps: Math.max(0, Math.floor(parts[0])) });
      }
    };

    telemetryChar.addEventListener("characteristicvaluechanged", handleNotification);
    await telemetryChar.startNotifications();

    const handleDisconnect = () => {
      onStatusUpdate("Wireless IMU disconnected.");
    };
    device.addEventListener("gattserverdisconnected", handleDisconnect);

    onStatusUpdate("Connected wirelessly via BLE");

    const sendExerciseCode = async (code: 1 | 2 | 3) => {
      try {
        const bytes = new TextEncoder().encode(String(code));
        await exerciseChar.writeValue(bytes);
        onStatusUpdate(`Wireless IMU set to exercise ${code}`);
      } catch (err) {
        onStatusUpdate(
          `Failed to send exercise ${code}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    const disconnect = async () => {
      try {
        telemetryChar.removeEventListener("characteristicvaluechanged", handleNotification);
        await telemetryChar.stopNotifications().catch(() => {});
      } catch {
        // ignore
      }
      try {
        device.removeEventListener("gattserverdisconnected", handleDisconnect);
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
      } catch {
        // ignore
      }
    };

    return { sendExerciseCode, disconnect };
  } catch (err) {
    onStatusUpdate(
      `Wireless connection failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}