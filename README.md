# Just Exercise — ECE 198

A webcam-based exercise tracking application built using React, TypeScript, and MediaPipe.

The application automatically counts exercise repetitions by tracking body landmarks and analyzing joint movements.

## Supported Exercises

- Front Raises
- Bicep Curls
- Lateral Raises

## Features

- Real-time body tracking using MediaPipe
- Automatic repetition counting for both arms
- Movement-specific angle and direction checks
- Live movement feedback
- Exercise selection and rep counter reset
- Advanced measurements for debugging

## Technologies

- React — User interface
- TypeScript — Movement detection and repetition logic
- MediaPipe — Body landmark tracking
- CSS — Styling and layout
- Vite — Development and build tooling

## Getting Started

1. Install Node.js.
2. Clone the repository and switch to the Afshal branch.
3. Open the project folder.
4. Run `npm install` (or `npm.cmd install` in Windows PowerShell).
5. Run `npm run dev` (or `npm.cmd run dev`).
6. Open the local URL displayed in the terminal.
7. Allow webcam access.

## Using the Application

Select an exercise from the dropdown.

Recommended camera positions:

- Front Raises: Approximately 30 degrees to the camera
- Bicep Curls: Front-facing or slightly angled (0–30 degrees)
- Lateral Raises: Face the camera directly

Keep both arms visible and follow the instructions on the screen.

The counter recognizes completed repetitions and displays movement feedback.

## Integration

The application dispatches browser events for integration with other components:

- `justexercise:rep` — Triggered after a completed repetition. Includes the exercise, rep count, and timestamp.
- `justexercise:exercisechange` — Triggered when the selected exercise changes.

Exercise identifiers: `front`, `bicep`, and `lateral`.

## Current Limitations

- Some repetitions may be missed due to camera positioning or tracking interruptions.
- Exercise results are not yet saved after refreshing the page.
- Hardware and database integration are still in development.
