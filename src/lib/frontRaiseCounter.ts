type Phase = "WAITING" | "DOWN" | "UP";

export class FrontRaiseCounter {
  private phase: Phase = "WAITING";
  private positionStartTime: number | null = null;

  private readonly LOW_ANGLE = 20;
  private readonly HIGH_ANGLE = 75;
  private readonly HOLD_TIME = 80;

  reset() {
    this.positionStartTime = null;
    this.phase = "WAITING";
  }

  update(
    leftShoulderAngle: number | null,
    rightShoulderAngle: number | null,
    currentTime: number
  ): boolean {
    if (leftShoulderAngle === null || rightShoulderAngle === null) {
      this.reset();
      return false;
    }

    const bothArmsDown =
      leftShoulderAngle <= this.LOW_ANGLE &&
      rightShoulderAngle <= this.LOW_ANGLE;

    const bothArmsUp =
      leftShoulderAngle >= this.HIGH_ANGLE &&
      rightShoulderAngle >= this.HIGH_ANGLE;

    const requiredAngleReached =
      this.phase === "DOWN" ? bothArmsUp : bothArmsDown;

    if (!requiredAngleReached) {
      this.positionStartTime = null;
      return false;
    }

    if (this.positionStartTime === null) {
      this.positionStartTime = currentTime;
      return false;
    }

    if (currentTime - this.positionStartTime < this.HOLD_TIME) {
      return false;
    }

    this.positionStartTime = null;

    if (this.phase === "DOWN") {
      this.phase = "UP";
      return false;
    }

    if (this.phase === "WAITING") {
      this.phase = "DOWN";
      return false;
    }

    if (this.phase === "UP") {
      this.phase = "DOWN";
      return true;
    }

    return false;
  }
}