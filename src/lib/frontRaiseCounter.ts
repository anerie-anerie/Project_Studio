type Phase = "WAITING" | "DOWN" | "UP";

export class FrontRaiseCounter {
    private phase: Phase = "WAITING"; // starting at waiting phase
    private positionStartTime: number | null = null; //Stores time when arm first entered the position we're checking
    
    // Defining criteria for a rep
    private readonly LOW_ANGLE = 20; 
    private readonly HIGH_ANGLE = 75;
    private readonly HOLD_TIME = 100;


    // Resetting
    reset() {
        this.positionStartTime = null;
        this.phase = "WAITING";
    }

    // Updating reps if all conditions met
    update(leftShoulderAngle: number | null, rightShoulderAngle: number | null, currentTime: number): boolean {

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

        // 6. Checking if phase held for 100 ms, 
        if (currentTime - this.positionStartTime < this.HOLD_TIME) {
            return false;
        }

        // Resetting start time for next phase once all conditions are met
        this.positionStartTime = null;

        // If we were waiting for arm to be "UP", all conditions are met so phase = UP
        if (this.phase === "DOWN") {
            this.phase = "UP";
            return false;
        }

        // If we were waiting for arm to be "DOWN", all conditions are met so phase = DOWN
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

