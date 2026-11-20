#include <ArduinoBLE.h>
#include "Arduino_BMI270_BMM150.h"

// Custom BLE Service & Characteristics for Just Exercise!
BLEService exerciseService("19b10000-e8f2-537e-4f6c-d104768a1214");

// Website writes "1", "2", or "3" here to select the exercise
BLECharacteristic exerciseChar(
  "19b10001-e8f2-537e-4f6c-d104768a1214",
  BLEWrite | BLEWriteWithoutResponse | BLERead,
  8
);

// Arduino notifies "angle,reps" (e.g. "42.50,3") wirelessly to the website
BLEStringCharacteristic telemetryChar(
  "19b10002-e8f2-537e-4f6c-d104768a1214",
  BLERead | BLENotify,
  32
);

// CONFIGURATION
// Default exercise: 1 = front raise, 2 = bicep curl, 3 = lateral raise
int exercise = 2;

float RAISED_THRESHOLD = 75.0;
float NEUTRAL_THRESHOLD = 35.0;

void setExercise(int ex) {
  if (ex == 1) {          // Front raise
    exercise = 1;
    RAISED_THRESHOLD = 55.0;
    NEUTRAL_THRESHOLD = 25.0;
  } else if (ex == 2) {   // Bicep curl
    exercise = 2;
    RAISED_THRESHOLD = 75.0;
    NEUTRAL_THRESHOLD = 35.0;
  } else if (ex == 3) {   // Lateral raise
    exercise = 3;
    RAISED_THRESHOLD = 55.0;
    NEUTRAL_THRESHOLD = 25.0;
  }
}

const float ALPHA = 0.2;
const int CALIBRATION_SAMPLES = 100;

float ax = 0.0, ay = 0.0, az = 0.0;
float filteredX = 0.0, filteredY = 0.0, filteredZ = 0.0;
float neutralX = 0.0, neutralY = 0.0, neutralZ = 0.0;

float movementAngle = 0.0;
int repCount = 0;

bool armRaised = false;
bool filterInitialized = false;
unsigned long lastNotifyMs = 0;

float calculateAngle(
  float x1, float y1, float z1,
  float x2, float y2, float z2
) {
  float dotProduct = x1 * x2 + y1 * y2 + z1 * z2;
  float mag1 = sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  float mag2 = sqrt(x2 * x2 + y2 * y2 + z2 * z2);

  if (mag1 == 0 || mag2 == 0) {
    return 0.0;
  }

  float cosine = constrain(dotProduct / (mag1 * mag2), -1.0, 1.0);
  return acos(cosine) * 180.0 / PI;
}

void applyExerciseCommand(int ex) {
  if (ex < 1 || ex > 3) return;
  setExercise(ex);
  repCount = 0;
  armRaised = false;
  exerciseChar.writeValue((uint8_t)ex);
}

void calibrateNeutral() {
  float sumX = 0.0, sumY = 0.0, sumZ = 0.0;
  int samplesCollected = 0;

  digitalWrite(LED_BUILTIN, HIGH); // ON while calibrating
  while (samplesCollected < CALIBRATION_SAMPLES) {
    if (IMU.accelerationAvailable()) {
      float x, y, z;
      IMU.readAcceleration(x, y, z);
      sumX += x;
      sumY += y;
      sumZ += z;
      samplesCollected++;
      delay(10);
    }
  }
  digitalWrite(LED_BUILTIN, LOW);  // OFF when calibrated

  neutralX = sumX / CALIBRATION_SAMPLES;
  neutralY = sumY / CALIBRATION_SAMPLES;
  neutralZ = sumZ / CALIBRATION_SAMPLES;

  filteredX = neutralX;
  filteredY = neutralY;
  filteredZ = neutralZ;
  filterInitialized = true;
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);

  setExercise(exercise);

  if (!IMU.begin()) {
    while (1) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(100);
      digitalWrite(LED_BUILTIN, LOW);
      delay(100);
    }
  }

  calibrateNeutral();

  if (!BLE.begin()) {
    while (1) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(250);
      digitalWrite(LED_BUILTIN, LOW);
      delay(250);
    }
  }

  BLE.setLocalName("JustExercise-IMU");
  BLE.setAdvertisedService(exerciseService);
  exerciseService.addCharacteristic(exerciseChar);
  exerciseService.addCharacteristic(telemetryChar);
  BLE.addService(exerciseService);

  exerciseChar.writeValue((uint8_t)exercise);
  telemetryChar.writeValue("0.00,0");

  BLE.advertise();
}

void loop() {
  BLE.poll();

  // Check if the website wrote an exercise number (1, 2, or 3) over BLE
  if (exerciseChar.written()) {
    int len = exerciseChar.valueLength();
    const uint8_t* data = exerciseChar.value();
    if (len > 0 && data != nullptr) {
      char ch = (char)data[0];
      int chosen = (ch == '1' || ch == '2' || ch == '3') ? (ch - '0') : (int)data[0];
      applyExerciseCommand(chosen);
    }
  }

  // Optional: also allow switching via USB Serial ('1', '2', '3')
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '1' || c == '2' || c == '3') {
      applyExerciseCommand(c - '0');
    }
  }

  if (IMU.accelerationAvailable()) {
    IMU.readAcceleration(ax, ay, az);

    if (!filterInitialized) {
      filteredX = ax;
      filteredY = ay;
      filteredZ = az;
      filterInitialized = true;
    } else {
      filteredX = ALPHA * ax + (1.0 - ALPHA) * filteredX;
      filteredY = ALPHA * ay + (1.0 - ALPHA) * filteredY;
      filteredZ = ALPHA * az + (1.0 - ALPHA) * filteredZ;
    }

    movementAngle = calculateAngle(
      neutralX, neutralY, neutralZ,
      filteredX, filteredY, filteredZ
    );

    if (!armRaised && movementAngle >= RAISED_THRESHOLD) {
      armRaised = true;
    } else if (armRaised && movementAngle <= NEUTRAL_THRESHOLD) {
      armRaised = false;
      repCount++;

      digitalWrite(LED_BUILTIN, HIGH);
      delay(120);
      digitalWrite(LED_BUILTIN, LOW);
    }

    unsigned long now = millis();
    if (now - lastNotifyMs >= 100) {
      lastNotifyMs = now;
      String payload = String(movementAngle, 2) + "," + String(repCount);
      telemetryChar.writeValue(payload);
      Serial.println(payload);
    }
  }
}
