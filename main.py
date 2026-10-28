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

  // z constants
  double zVoltage;
  float g_z; //acceleration in gravities
  float g_z_smoothed;
  float accelZ; //acceleration in ms^2
  float accelZ_smoothed;

  double yVoltage;
  float g_y; //acceleration in gravities
  float g_y_smoothed;
  float accelY; //acceleration in ms^2
  float accelY_smoothed;

  double xVoltage;
  float g_x; //acceleration in gravities
  float g_x_smoothed;
  float accelX; //acceleration in ms^2
  float accelX_smoothed;


  // accelerometer data
  zVoltage = readAveragedVoltage(zPin, SAMPLES);
  zSmoothedVoltage = smooth(zVoltage, zSmoothedVoltage, AlphaAcc);
  g_z = (zVoltage - RestVoltage) / sensitivity;
  g_z_smoothed = (zSmoothedVoltage - RestVoltage) / sensitivity;
  accelZ = g_z * 9.81; //convert gravities to ms^2
  
  accelZ_smoothed = g_z_smoothed * 9.81;
  Serial.print(accelZ_smoothed);

  yVoltage = readAveragedVoltage(yPin, SAMPLES);
  ySmoothedVoltage = smooth(yVoltage, ySmoothedVoltage, AlphaAcc);
  g_y = (yVoltage - RestVoltage) / sensitivity;
  g_y_smoothed = (ySmoothedVoltage - RestVoltage) / sensitivity;
  accelY = g_y * 9.81; //convert gravities to ms^2
  accelY_smoothed = g_y_smoothed * 9.81;
  Serial.print(",");
  Serial.print(accelY_smoothed);

  xVoltage = readAveragedVoltage(xPin, SAMPLES);
  xSmoothedVoltage = smooth(xVoltage, xSmoothedVoltage, AlphaAcc);
  g_x = (xVoltage - RestVoltage) / sensitivity;
  g_x_smoothed = (xSmoothedVoltage - RestVoltage) / sensitivity;
  accelX = g_x * 9.81; //convert gravities to ms^2
  accelX_smoothed = g_x_smoothed * 9.81;
  Serial.print(",");
  Serial.print(accelX_smoothed);

  Serial.print(",");

  // average acceleration (check if previous greater or less than )
  avgAccel = ((accelX_smoothed + accelY_smoothed + accelZ_smoothed)/3);
  

  // use average acceleration to see if movement was made
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

  Serial.println(avgAccel);
  delay(50); // Delay for readability
}
