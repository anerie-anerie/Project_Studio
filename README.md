# Just Exercise!

A webcam-based exercise tracker built with React, TypeScript, and MediaPipe. The application tracks body movements in real time and automatically counts exercise repetitions.

## Supported Exercises

- Front Raises
- Bicep Curls
- Lateral Raises

Each exercise has its own movement detection logic to recognize completed repetitions and distinguish between different types of arm movements.

## How It Works

MediaPipe detects body landmarks such as the shoulders, elbows, wrists, and hips.

Using these coordinates, the application:

1. Calculates joint angles and movement directions using vector math.
2. Checks whether the movement meets the conditions for the selected exercise.
3. Uses a state machine to track the movement and count completed repetitions.

The interface displays live body tracking, a repetition counter, and movement feedback.

## Tech Stack

- **React + TypeScript** — Application interface and exercise tracking logic
- **MediaPipe** — Real-time body landmark detection
- **CSS** — Interface styling
- **Vite** — Development and build tooling

## Getting Started

**Requirements:** Node.js and a working webcam.

Clone the repository and switch to the exercise tracker branch:

```bash
git clone -b Afshal https://github.com/anerie-anerie/Project_Studio.git
cd Project_Studio
```

Install dependencies:

```bash
npm install
```

Start the application:

```bash
npm run dev
```

Open the local URL shown in your terminal (usually `http://localhost:5173/`) and allow camera access.

*On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution is blocked.*

## Using the Tracker

Select an exercise from the dropdown and position yourself so both arms are visible.

Recommended camera angles:

| Exercise | Camera Position |
|---|---|
| Front Raises | Approximately 30° |
| Bicep Curls | Front-facing or slightly angled (0–30°) |
| Lateral Raises | Straight on |

Follow the on-screen instructions. The repetition counter updates as you complete each movement, and you can reset it at any time.