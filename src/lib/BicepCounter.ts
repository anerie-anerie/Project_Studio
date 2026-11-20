type Phase = "WAITING" | "DOWN" | "UP";

export class BicepCounter {
  private phase: Phase = "WAITING";
  private positionStartTime: number | null = null;

  // Elbow angle criteria:
  // Arm extended down = ~160°-180° (>= EXTENDED_ANGLE)
  // Arm curled up = ~35°-55° (<= CURLED_ANGLE)
  private readonly EXTENDED_ANGLE = 150;
  private readonly CURLED_ANGLE = 60;
  private readonly HOLD_TIME = 200;

  getPhase(): Phase {
    return this.phase;
  }

  reset() {
    this.positionStartTime = null;
    this.phase = "WAITING";
  }

  update(
    leftElbowAngle: number | null,
    rightElbowAngle: number | null,
    currentTime: number
  ): boolean {
    // 1. Reset if either arm loses tracking
    if (leftElbowAngle === null || rightElbowAngle === null) {
      this.reset();
      return false;
    }

    // 2. Check angles of both arms
    const bothArmsDown =
      leftElbowAngle >= this.EXTENDED_ANGLE &&
      rightElbowAngle >= this.EXTENDED_ANGLE;

    const bothArmsUp =
      leftElbowAngle <= this.CURLED_ANGLE &&
      rightElbowAngle <= this.CURLED_ANGLE;

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

    // Waiting for arm to curl "UP" -> all conditions met so phase = UP
    if (this.phase === "DOWN") {
      this.phase = "UP";
      return false;
    }

    // Waiting for arm to be extended "DOWN" -> all conditions met so phase = DOWN
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