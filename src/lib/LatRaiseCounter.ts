export type Phase = "WAITING" | "DOWN" | "UP";

export class LatRaiseCounter {
  private phase: Phase = "WAITING";
  private positionStartTime: number | null = null;

  // Shoulder abduction angle criteria:
  // Arms resting by sides = ~0°-20° (<= LOW_ANGLE)
  // Arms raised laterally to shoulder height = ~75°-90° (>= HIGH_ANGLE)
  private readonly LOW_ANGLE = 20;
  private readonly HIGH_ANGLE = 75;
  private readonly HOLD_TIME = 80;

  getPhase(): Phase {
    return this.phase;
  }

  reset() {
    this.positionStartTime = null;
    this.phase = "WAITING";
  }

  update(
    leftShoulderAngle: number | null,
    rightShoulderAngle: number | null,
    currentTime: number
  ): boolean {
    // 1. Reset if either arm loses tracking
    if (leftShoulderAngle === null || rightShoulderAngle === null) {
      this.reset();
      return false;
    }

    // 2. Check angles of both arms
    const bothArmsDown =
      leftShoulderAngle <= this.LOW_ANGLE &&
      rightShoulderAngle <= this.LOW_ANGLE;

    const bothArmsUp =
      leftShoulderAngle >= this.HIGH_ANGLE &&
      rightShoulderAngle >= this.HIGH_ANGLE;

    // 3. Determine which position we're waiting for
    let requiredAngleReached: boolean;

    if (this.phase === "DOWN") {
      requiredAngleReached = bothArmsUp;
    } else {
      requiredAngleReached = bothArmsDown;
    }

    // 4. Timer doesn't start until required angle reached
    if (!requiredAngleReached) {
      this.positionStartTime = null;
      return false;
    }

    // 5. New timer starts when start time resets
    if (this.positionStartTime === null) {
      this.positionStartTime = currentTime;
      return false;
    }

    // 6. Checking if phase held for HOLD_TIME ms
    if (currentTime - this.positionStartTime < this.HOLD_TIME) {
      return false;
    }

    // Resetting start time for next phase once all conditions are met
    this.positionStartTime = null;

    // Waiting for arms to raise "UP" -> all conditions met so phase = UP
    if (this.phase === "DOWN") {
      this.phase = "UP";
      return false;
    }

    // Waiting for arms to be "DOWN" -> all conditions met so phase = DOWN
    if (this.phase === "WAITING") {
      this.phase = "DOWN";
      return false;
    }

    // +1 rep!
    if (this.phase === "UP") {
      this.phase = "DOWN";
      return true;
    }

    return false;
  }
}