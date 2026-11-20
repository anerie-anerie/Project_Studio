/**
 * Counts complete two-arm repetitions using a small state machine per arm.
 * A rep is registered only after both arms move from the starting position
 * to the target position and return, with brief holds at each threshold.
 */

type Kind = "front" | "curl" | "lateral";
type Phase = "START" | "READY" | "UP" | "DONE";
type ArmState = {
  phase: Phase;
  holdStart: number | null;
  lastSeen: number | null;
  completedAt: number | null;
};

function initialArmState(): ArmState {
  return { phase: "START", holdStart: null, lastSeen: null, completedAt: null };
}

export class TwoArmRepCounter {
  private left: ArmState = initialArmState();
  private right: ArmState = initialArmState();
  // Apply per-exercise timing without changing the working lateral-raise rules.
  private readonly holdMs: number;
  private readonly dropoutGraceMs: number;
  private readonly pairWindowMs = 3000;

  private readonly kind: Kind;

  constructor(kind: Kind) {
    this.kind = kind;
    this.holdMs = kind === "curl" ? 50 : kind === "front" ? 55 : 80;
    this.dropoutGraceMs = kind === "curl" ? 650 : kind === "front" ? 450 : 350;
  }

  reset(): void {
    this.left = initialArmState();
    this.right = initialArmState();
  }

  private atStart(angle: number): boolean {
    return this.kind === "curl" ? angle >= 135 : angle <= 30;
  }

  private atTarget(angle: number): boolean {
    return this.kind === "curl" ? angle <= 115 : angle >= 70;
  }

  private updateArm(arm: ArmState, angle: number | null, time: number): void {
    if (angle === null || !Number.isFinite(angle)) {
      arm.holdStart = null;
      if (arm.lastSeen !== null && time - arm.lastSeen > this.dropoutGraceMs) {
        Object.assign(arm, initialArmState());
      }
      return;
    }

    arm.lastSeen = time;
    if (arm.phase === "DONE") return;

    const inPosition = arm.phase === "READY" ? this.atTarget(angle) : this.atStart(angle);
    if (!inPosition) {
      arm.holdStart = null;
      return;
    }

    if (arm.holdStart === null) {
      arm.holdStart = time;
      return;
    }
    if (time - arm.holdStart < this.holdMs) return;

    arm.holdStart = null;
    if (arm.phase === "START") arm.phase = "READY";
    else if (arm.phase === "READY") arm.phase = "UP";
    else if (arm.phase === "UP") {
      arm.phase = "DONE";
      arm.completedAt = time;
    }
  }

  update(left: number | null, right: number | null, time: number): boolean {
    this.updateArm(this.left, left, time);
    this.updateArm(this.right, right, time);

    if (this.left.phase === "DONE" && this.right.phase === "DONE") {
      const leftTime = this.left.completedAt ?? time;
      const rightTime = this.right.completedAt ?? time;
      if (Math.abs(leftTime - rightTime) <= this.pairWindowMs) {
        // The return to the starting position also prepares the next rep.
        this.left = { ...initialArmState(), phase: "READY", lastSeen: time };
        this.right = { ...initialArmState(), phase: "READY", lastSeen: time };
        return true;
      }
    }

    for (const arm of [this.left, this.right]) {
      if (arm.phase === "DONE" && arm.completedAt !== null &&
          time - arm.completedAt > this.pairWindowMs) {
        Object.assign(arm, initialArmState());
      }
    }
    return false;
  }

  getStatus(): string {
    const label = (phase: Phase): string => {
      if (phase === "START") return this.kind === "curl" ? "straighten arms to start" : "start with arms down";
      if (phase === "READY") return this.kind === "curl" ? "bend elbows to curl" : "raise arms";
      if (phase === "UP") return this.kind === "curl" ? "straighten elbows to finish" : "lower arms to finish";
      return "waiting for other arm";
    };
    if (this.left.phase === this.right.phase) return label(this.left.phase);
    return `Left: ${label(this.left.phase)} | Right: ${label(this.right.phase)}`;
  }
}
