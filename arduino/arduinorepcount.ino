#include "Arduino_BMI270_BMM150.h"
// CONFIGURATION

// Pick the exercise: 1 = front raise, 2 = bicep curl, 3 = lateral raise
int exercise = 2;

// Angle required to register a raised arm (set by setExercise)
float RAISED_THRESHOLD = 60.0;

// Angle required to return to neutral (set by setExercise)
float NEUTRAL_THRESHOLD = 25.0;

// Sets the thresholds for the chosen exercise
void setExercise(int ex) {
    if (ex == 1) {          // Front raise
        RAISED_THRESHOLD = 55.0;
        NEUTRAL_THRESHOLD = 25.0;
    } else if (ex == 2) {   // Bicep curl
        RAISED_THRESHOLD = 75.0;
        NEUTRAL_THRESHOLD = 35.0;
    } else if (ex == 3) {   // Lateral raise
        RAISED_THRESHOLD = 55.0;
        NEUTRAL_THRESHOLD = 25.0;
    }
}

// Smoothing factor (lower = smoother)
const float ALPHA = 0.2;

// Number of samples used for calibration
const int CALIBRATION_SAMPLES = 100;

// VARIABLES

// Current accelerometer readings
float ax = 0.0;
float ay = 0.0;
float az = 0.0;

// Filtered acceleration
float filteredX = 0.0;
float filteredY = 0.0;
float filteredZ = 0.0;

// Starting (neutral) position
float neutralX = 0.0;
float neutralY = 0.0;
float neutralZ = 0.0;

// Movement tracking
float movementAngle = 0.0;
int repCount = 0;

bool armRaised = false;
bool filterInitialized = false;

// CALCULATE ANGLE BETWEEN TWO VECTORS

float calculateAngle(
    float x1, float y1, float z1,
    float x2, float y2, float z2
) {

    // Dot product
    float dotProduct = x1*x2 + y1*y2 + z1*z2;

    // Magnitudes
    float mag1 = sqrt(x1*x1 + y1*y1 + z1*z1);
    float mag2 = sqrt(x2*x2 + y2*y2 + z2*z2);

    if (mag1 == 0 || mag2 == 0) {
        return 0.0;
    }

    // Normalize dot product
    float cosine = dotProduct / (mag1 * mag2);

    // Prevent numerical errors
    cosine = constrain(cosine, -1.0, 1.0);

    // Convert radians to degrees
    return acos(cosine) * 180.0 / PI;
}

// SETUP

void setup() {

    pinMode(LED_BUILTIN, OUTPUT);   // set up the built-in light

    //Load the thresholds for the chosen exercise
    setExercise(exercise);

    Serial.begin(115200);

    if (!IMU.begin()) {
        Serial.println("IMU initialization failed!");
        // Sensor failed: blink fast forever so the user knows
        while (1) {
            digitalWrite(LED_BUILTIN, HIGH);
            delay(100);
            digitalWrite(LED_BUILTIN, LOW);
            delay(100);
        }
    }

    Serial.println("Exercise Rep Tracker");
    Serial.print("Exercise: ");
    Serial.println(exercise);

    // Calibrate neutral arm position
    Serial.println("Keep your arm in the starting position...");

    float sumX = 0;
    float sumY = 0;
    float sumZ = 0;

    
    int samplesCollected = 0;
    digitalWrite(LED_BUILTIN, HIGH);   // light ON = hold still, calibrating
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

    // Calculate average starting acceleration
    neutralX = sumX / CALIBRATION_SAMPLES;
    neutralY = sumY / CALIBRATION_SAMPLES;
    neutralZ = sumZ / CALIBRATION_SAMPLES;

    // Initialize filter
    filteredX = neutralX;
    filteredY = neutralY;
    filteredZ = neutralZ;

    filterInitialized = true;

    Serial.println("Calibration complete!");
    digitalWrite(LED_BUILTIN, LOW);    // light OFF = ready to start
    Serial.println("Start raising your arm.");
    Serial.println();

    Serial.println("X,Y,Z,Angle,Reps");
}

// MAIN LOOP


void loop() {

    if (IMU.accelerationAvailable()) {

        // Read raw 3D acceleration
        IMU.readAcceleration(ax, ay, az);

        // Smooth sensor readings
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

        // Calculate orientation change from neutral
        movementAngle = calculateAngle(
            neutralX, neutralY, neutralZ,
            filteredX, filteredY, filteredZ
        );

        // REP COUNTING

        // Arm has reached the raised position
        if (!armRaised && movementAngle >= RAISED_THRESHOLD) {

            armRaised = true;

            Serial.println("ARM RAISED!");
        }

        // Arm has returned to neutral position
        else if (armRaised && movementAngle <= NEUTRAL_THRESHOLD) {

            armRaised = false;

            repCount++;
            // Blink once to show a rep was counted
            digitalWrite(LED_BUILTIN, HIGH);
            delay(200);
            digitalWrite(LED_BUILTIN, LOW);

            Serial.print("REP COMPLETED: ");
            Serial.println(repCount);
        }

        // SERIAL OUTPUT

        Serial.print(filteredX, 3);
        Serial.print(",");

        Serial.print(filteredY, 3);
        Serial.print(",");

        Serial.print(filteredZ, 3);
        Serial.print(",");

        Serial.print(movementAngle, 2);
        Serial.print(",");

        Serial.println(repCount);
    }

    delay(100);
}
