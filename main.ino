const int xPin = A0;
const int yPin = A1;
const int zPin = A2;
const int SAMPLES = 10;
const float RestVoltage = 1.641; // Voltage at 0 gravity (g) at 3.3V
const float sensitivity = 0.3; // Sensitivity in V/gravity (g) (1 g = 9.81
float zSmoothedVoltage = RestVoltage;
float ySmoothedVoltage = RestVoltage;
float xSmoothedVoltage = RestVoltage;
double AlphaAcc = 0.5;
double avgAccel = 0;
// Supporting Functions

float readAveragedVoltage(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
  sum += analogRead(pin);
  delayMicroseconds(500);
  }
  return (sum / (float)samples) * (3.3 / 1023.0);
}
//-----
// smooth out measured value for plotting
float smooth(float newVal, float prevVal, double alpha) {
  return alpha * prevVal + (1 - alpha) * newVal;
// return newVal;
}
// Main Functions ... starts with setup() then does loop()
void setup() {
  Serial.begin(9600);
  delay(1000);
}
// main functional block
void loop() {

/*
mobility: arm raimbows, wall angels
squat/lunge: box squats, lunges
push: front raises, shoulder press
hinge: glute bridges, deadlifts
pull: bent-over rows, hammer curls
carry: Farmer’s carry, 
core: leg raises, plank
stretch: hamstring stretch, childs pose
*/
  float zVoltage = readAveragedVoltage(zPin, SAMPLES);
  float accelZ = (((zVoltage - RestVoltage) / sensitivity) * 9.81);

  float yVoltage = readAveragedVoltage(yPin, SAMPLES);
  float accelY = (((yVoltage - RestVoltage) / sensitivity) * 9.81);

  float xVoltage = readAveragedVoltage(xPin, SAMPLES);
  float accelX = (((xVoltage - RestVoltage) / sensitivity) * 9.81);

  // Calculate the vector magnitude minus gravity (approx 9.81 m/s^2)
  // This ensures standing still = 0 acceleration, and moving = positive acceleration regardless of tilt
  float totalAccel = sqrt(sq(accelX) + sq(accelY) + sq(accelZ));
  float dynamicAccel = abs(totalAccel - 9.81); 

  // Print just the clean dynamic acceleration
  Serial.println(dynamicAccel);

  delay(50);
}
