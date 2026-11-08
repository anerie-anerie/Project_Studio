
# Exercise Tracker — ECE 198

A webcam-based exercise tracker built with React, TypeScript, and MediaPipe. The current prototype supports Front Raises, with live arm tracking, form feedback, and automatic repetition counting.

## How to Run

1. Install Node.js (includes npm).
2. Open a terminal in the project folder.
3. Run:

```bash
npm install
npm run dev
```

4. Open the local URL displayed in the terminal (usually http://localhost:5173).
5. Allow camera access when prompted.

## How to Use

1. Stand approximately 30–45° to the camera, with both arms and hips visible.
2. Start with both arms down by your sides.
3. Raise both arms forward to shoulder height, then lower them together.
4. The app tracks your left and right arms, provides form feedback, and automatically counts completed repetitions.
5. Click **Reset Counter** to start again.

## Notes

This is a work-in-progress prototype. Some repetitions may be missed depending on camera positioning, visibility, and movement speed.
