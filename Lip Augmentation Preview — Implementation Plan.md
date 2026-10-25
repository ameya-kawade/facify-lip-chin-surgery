# Lip Augmentation Preview — Implementation Plan

*Phase 1 of the facial-surgery-preview project — lip augmentation only. For an autonomous coding agent (e.g. Google Antigravity) to execute end-to-end.*

## 1. Scope

Build the live-camera **lip augmentation** preview, and only that. Explicitly OUT of scope for this plan: chin/genioplasty, rhinoplasty, 3D rendering, WebGL rendering, open-mouth/expression-aware deformation, any backend or data storage. If something below seems to require one of those, stop and flag it rather than adding it.

This plan folds in four specific engineering decisions that correct problems in an earlier draft approach, plus the full original lip-augmentation spec. The four corrections, used throughout, are:

1. Use a **fixed mesh topology**, never a per-frame Delaunay re-triangulation.
2. **Smooth landmarks** with a One Euro Filter before anything else touches them.
3. Render warping with the **Canvas 2D API** (per-triangle affine draws), not custom WebGL, for this phase.
4. Keep the **per-frame tracking/render loop out of React state** entirely.

## 2. Tech Stack

- React + TypeScript + Vite.
- MediaPipe Face Landmarker for Web (Tasks Vision API), VIDEO running mode, GPU delegate with CPU fallback, 478 landmarks (attention-mesh/refine\_landmarks ON — the finer lip and iris landmarks matter here).
- A constrained-Delaunay-triangulation library (e.g. poly2tri) used exactly ONCE at startup, never per frame.
- Browser Canvas 2D API for rendering. No WebGL in this phase.
- `navigator.mediaDevices.getUserMedia()` for camera access.
- No AI inference backend. Everything runs client-side in the browser. No camera frame or landmark data is transmitted or stored anywhere.

## 3. High-Level Data Flow

Camera → MediaPipe Face Landmarker (raw landmarks + confidence) → One Euro Filter (smoothed landmarks) → Mesh Builder (fixed base face triangulation + a one-time constrained lip sub-mesh) → Lip Deformation Engine (reads slider values, outputs new vertex positions for lip-region vertices only) → Canvas Triangle-Warp Renderer (reads the current raw video frame plus source/destination triangle pairs, draws the result) → shown to the user.

Slider values live in React for the purpose of rendering the slider UI. Everything from "MediaPipe" onward, every single frame, lives OUTSIDE React state — in refs, driven by one `requestAnimationFrame` loop. See Phase 6 for exactly how this split works and why.

## 4. Directory Structure

```
src/
├── tracking/
│   ├── faceTracker.ts        — wraps MediaPipe Face Landmarker; exposes getLatestLandmarks() + confidence
│   ├── oneEuroFilter.ts      — generic One Euro Filter class, one instance per smoothed scalar
│   ├── landmarkSmoother.ts   — applies a filter pair to every one of the 478 landmarks each frame
│   └── poseEstimator.ts      — minimal: reads MediaPipe's face transformation matrix to estimate frontal-vs-off-angle and feed the confidence/fallback gate (see Section 6)
│
├── mesh/
│   ├── canonicalTriangulation.ts — the FIXED, published triangle-index list for the 468/478-point MediaPipe mesh (copied once as a constant — never generated at runtime)
│   ├── lipControlPoints.ts       — generates the extra lip-region control points, once, from a neutral reference frame
│   ├── lipMeshBuilder.ts         — runs the ONE-TIME constrained triangulation that merges the lip control points into the canonical mesh; exposes the resulting fixed vertex + triangle lists
│   └── deformationWeights.ts     — Region A / B / C membership and weight per lip-mesh vertex, computed once and reused every frame
│
├── surgeries/
│   └── lipAugmentation.ts     — the deformation engine: given smoothed landmarks + current slider values, returns new positions for lip-region vertices
│
├── warping/
│   ├── triangleWarp.ts        — warps ONE triangle via Canvas 2D (the core primitive)
│   └── imageWarper.ts         — loops over every lip-mesh triangle, calls triangleWarp, composites the result onto the output canvas
│
├── rendering/
│   └── liveRenderer.ts        — the single requestAnimationFrame loop: tracking → smoothing → deformation → warping, every frame, with nothing written to React state
│
├── components/
│   ├── CameraPreview.tsx      — mounts the hidden <video> + visible <canvas>, requests camera permission
│   ├── ParameterControls.tsx  — the four lip sliders; writes to a ref object, not to state that re-renders the render loop's inputs
│   ├── BeforeAfterToggle.tsx  — swap between the live modified view and the raw camera feed
│   ├── ResetButton.tsx        — resets all slider refs (and their visible slider positions) to 0
│   └── TrackingStatusBadge.tsx — optional, throttled (a few times/sec at most) display of tracking confidence / "face not detected"
│
└── App.tsx                     — top-level composition; owns the <video>/<canvas> refs and the slider-value ref object
```

`canonicalTriangulation.ts` covers the WHOLE face, not just the mouth — this is deliberate, so a later phase can add chin or other regions onto the same base mesh without rebuilding it. For this phase, only the lip sub-mesh triangles ever carry non-zero displacement; every other triangle is left at its identity mapping, which is why Section 7's renderer can skip warping them entirely and just draw the raw frame underneath.

## 5. Phase-by-Phase Task Breakdown

### Phase 0 — Scaffold

- Initialize a Vite + React + TypeScript project.
- Install `@mediapipe/tasks-vision` and a constrained-triangulation package (e.g. `poly2tri`). Do not install any WebGL library yet.
- Add a hidden `<video>` element (capture source only, never shown to the user) and a visible `<canvas>` element (the actual output) to `App.tsx`.
- **Done when:** `npm run dev` shows a blank page that prompts for camera permission as soon as the component mounts.

### Phase 1 — Camera capture + raw landmark detection

- `CameraPreview.tsx`: call `getUserMedia` with video-only constraints, attach the stream to the hidden `<video>`, and signal "ready" once the video's `loadeddata` event fires.
- `faceTracker.ts`: load the MediaPipe Face Landmarker (float16 model), `runningMode: VIDEO`, `numFaces: 1`, 478 landmarks, GPU delegate with a CPU-delegate fallback if GPU init fails. Leave `outputFaceBlendshapes` off for this phase — it isn't used yet. Call its video-detection function once per frame, driven by Phase 6's loop (not by a separate timer of its own), and store the raw landmark array plus a confidence value in a ref.
- `poseEstimator.ts` (minimal): read the face transformation matrix MediaPipe returns and derive a simple frontal-vs-off-angle estimate (e.g. the matrix's implied yaw/pitch). This only needs to answer one question for now: "is the face frontal/near-frontal enough to trust the effect, yes or no."
- **Done when:** logging the raw landmark array shows 478 (x, y, z) points updating every frame, and a debug dot-overlay visibly tracks the face correctly as the user moves and turns.

### Phase 2 — Landmark smoothing: One Euro Filter *(correction #2)*

- `oneEuroFilter.ts`: a small reusable filter class. Each instance smooths ONE scalar value over time and needs three parameters: `minCutoff` (lower = smoother when the signal is nearly still), `beta` (higher = less lag during fast motion), and `dCutoff` (a fixed low value such as 1.0 — rarely needs tuning). On each call, given the current raw value and a timestamp: estimate velocity from the previous value and elapsed time, derive an adaptive cutoff frequency as `cutoff = minCutoff + beta × |velocity|`, then return an exponentially-weighted blend of the previous smoothed value and the new raw value using that cutoff (a higher cutoff lets more of the new value through; a lower cutoff favors the smoothed history). Start with `minCutoff ≈ 1.0`, `beta ≈ 0.3` as defaults, kept as named constants in one place so they're easy to retune by eye later — do not hard-code them inline elsewhere.
- `landmarkSmoother.ts`: create ONE filter instance per landmark index PER coordinate — 478 landmarks × 2 coordinates (x, y) = 956 filter instances total. Ignore z for this 2D-only phase. Each frame, feed every raw (x, y) pair through its matching filter pair and collect the smoothed 478-point array.
- Wire this in immediately after `faceTracker.ts` and before anything else (mesh, deformation) ever reads a landmark. Nothing downstream should read raw landmarks directly — only the smoothed output.
- **Done when:** using the Phase 1 debug overlay, the smoothed points visibly stop micro-jittering when the face is held still, while still tracking responsively during an ordinary head turn (no noticeably added lag).

### Phase 3 — Fixed mesh topology + one-time lip sub-mesh *(correction #1)*

- `canonicalTriangulation.ts`: a constant file containing the fixed, published triangle-index list for MediaPipe's 468/478-point face mesh — the same topology MediaPipe's own face-mesh effects ship with. Copy this published array once; do **not** generate it with Delaunator or any other live triangulation. This constant covers the whole face and is reused unchanged for the project's lifetime.
- `lipControlPoints.ts`: generate extra control points inside and around the mouth, using ONE neutral/reference frame's landmark positions as the basis — not recomputed every frame. Concentrate points along the upper and lower vermilion borders, a few around each mouth corner, and a light grid filling the surrounding skin transition zone. Target roughly 100–200 extra points for this MVP (within the project's original 100–300 benchmarking range); the exact count is tunable after visual testing, but once chosen it is fixed, not dynamic per frame.
- `lipMeshBuilder.ts`: run a CONSTRAINED Delaunay triangulation exactly ONCE, at app startup, on the neutral reference positions, merging (a) the canonical landmarks nearest the mouth and (b) the new lip control points. Mark the vermilion border and the mouth-corner-to-jaw boundary as constrained edges so no triangle can cross from lip tissue into surrounding skin. The output — a fixed vertex list (each with its neutral/original position) and a fixed triangle index list — are both constants from this point on. For every lip-mesh vertex, record whether it tracks a live MediaPipe landmark index (so it moves with tracking every frame) or is an interior point computed relative to its neighboring landmarks.
- Merge this lip sub-mesh with `canonicalTriangulation.ts`, replacing the mouth-area triangles of the canonical mesh with the new, finer lip sub-mesh in that region, to form one combined whole-face vertex + triangle list.
- **Done when:** a debug wireframe overlay shows one stable triangle mesh across the whole face, visibly denser around the lips, where the triangle COUNT and CONNECTIVITY stay provably identical frame-to-frame as the user moves or talks — only vertex positions move, never the topology.

### Phase 4 — Lip deformation engine

- `lipAugmentation.ts` receives the current smoothed landmark set, the fixed lip-mesh topology from Phase 3, the Region A/B/C weight map from `deformationWeights.ts`, and the current slider values; it returns a new position for every vertex in the lip sub-mesh (vertices elsewhere on the face are left untouched).
- Map each illustrative UI slider range to a small normalized displacement inside this one file, in one place, so the mapping is easy to retune after visual testing. Illustrative ranges: Upper lip fullness (−20 to +20), Lower lip fullness (−20 to +20), Overall lip fullness (−20 to +20), Lip width (−15 to +15). These are UI ranges, not medical measurements.
- Required landmarks/features to read from the smoothed set: left/right mouth corners, upper vermilion border, lower vermilion border, Cupid's bow, upper/lower inner lip boundary, and the surrounding-skin points added in Phase 3.
- Region weighting (from `deformationWeights.ts`, computed once from the fixed mesh and reused every frame): Region A (lip interior) gets the full displacement weight (1.0); Region B (the vermilion border itself) gets a reduced, carefully controlled weight so the natural lip contour is preserved rather than smeared; Region C (surrounding skin) tapers that weight smoothly down to 0 so the deformation blends into untouched skin with no abrupt jump between neighboring vertices (an abrupt jump is what causes a visible seam).
- Mouth corners are anchors: for fullness adjustments (upper, lower, overall) they must not move at all. Only the width parameter is allowed to move them, and only horizontally, in a controlled, limited way — interpolate the lip vertices between the corners smoothly rather than translating the whole region, and do not let the displacement spread into the lower face/chin area.
- Upper lip fullness: move the upper lip contour outward/upward while explicitly preserving the Cupid's bow shape and the relationship between the upper and lower lips.
- Lower lip fullness: move the lower lip contour, preserve the inner lip boundary, and do not let displacement reach the chin or the skin below the lower lip.
- Overall fullness: apply the upper and lower logic together, scaled by one shared value.
- Scope limitation to respect here: implement and test for neutral, CLOSED-MOUTH expressions only in this phase. Open mouth, visible teeth, speech, and smiling are known hard cases that are explicitly deferred — it's acceptable if the effect looks imperfect under those conditions, as long as it does not crash or visibly tear the image.
- **Done when:** moving each slider independently produces a visibly isolated effect — moving only "lip width" does not noticeably change fullness, and vice versa — with the mouth corners staying stable except when width is adjusted, tested on a neutral closed-mouth face.

### Phase 5 — Rendering: Canvas 2D per-triangle warp *(correction #3)*

- `triangleWarp.ts` exports a function that warps ONE triangle: given the output canvas context, the current raw video frame, a source triangle (3 points, from the mesh's original/neutral positions) and a destination triangle (3 points, from Phase 4's deformed positions), it should: save the canvas state; trace a path through the three destination points and clip the context to that path; compute the 2D affine transform mapping the source triangle onto the destination triangle (a standard 3-point-to-3-point affine mapping — six unknowns solved from the six coordinate correspondences; any small affine-solve helper or library is fine, this does not need to be derived by hand); apply that transform to the canvas context; draw the FULL raw video frame onto the canvas (because the active clip means only the destination triangle actually gets painted); restore the canvas state.
- `imageWarper.ts` orchestrates the whole frame: first draw the current raw video frame to the output canvas once, completely unmodified — this is the "untouched skin and background" base layer, and it is correct to use it as-is for every triangle outside the lip sub-mesh, since those triangles carry zero displacement in this phase. Then loop over every triangle in the lip sub-mesh ONLY, calling `triangleWarp.ts` for each one, drawing the warped lip region on top of that base layer.
- Validate this renderer on a single static test image BEFORE wiring it to live video: feed it one photo, drive the sliders, and confirm the lips visibly plump/widen with no seam and the rest of the image is pixel-identical to the source. Only after that passes, connect the same renderer to the live camera frame — this should require no changes to `triangleWarp.ts` or `imageWarper.ts`, only swapping where the source image comes from.
- Do not implement a WebGL path in this phase. If Canvas 2D warping cannot sustain an acceptable frame rate, that's a signal to revisit in a later phase — verify by actually measuring frame time once live, don't assume it in advance.
- **Done when:** on both the static test image and live video, slider changes visibly plump/widen the lips with no visible seam at the mesh boundary across the tested slider range, and teeth/surrounding skin remain visually untouched.

### Phase 6 — React architecture: decoupled render loop *(correction #4)*

- Do not store per-frame landmarks, smoothed landmarks, mesh vertex positions, or the slider values used for rendering in React state (`useState`). All of this changes 30–60 times per second; storing it in state would force a full React re-render at that rate for no benefit.
- Store the CURRENT slider values in a plain mutable ref object (e.g. one object in a `useRef`, with fields for upper fullness, lower fullness, overall fullness, width) that the slider components write to directly on change. React state can still back the slider's own visual position so the thumb renders correctly — only the numeric value actually consumed by the per-frame render loop should come from the ref, not from state.
- `liveRenderer.ts` is a single loop, started once (e.g. from a `useEffect` with an empty dependency array), that calls itself via `requestAnimationFrame` (or `video.requestVideoFrameCallback` if available, which ties more precisely to actual new video frames). Each iteration: run `faceTracker`'s detection for the current frame, run `landmarkSmoother`, read the current values from the slider ref, run `lipAugmentation.ts`, run `imageWarper.ts`, then schedule the next iteration. Nothing in this loop calls `setState`.
- If any UI element needs to reflect live status (frame rate, tracking confidence, a "face not detected" warning from `poseEstimator.ts`), update it through a throttled state update — at most a few times per second — never on every frame.
- **Done when:** React DevTools' render highlighting shows slider components and status badges re-rendering only when their own values actually change (a slider drag, or a few times/sec for a status badge) — never 30+ times per second from tracking or rendering activity.

## 6. Carried Over From the Original Spec (apply as-is, lip scope only)

- Always warp the CURRENT unmodified camera frame. Never re-warp a previously-warped output frame — repeated resampling introduces blur, accumulated geometric error, and visible drift.
- Texture preservation: never replace lip pixels with any generated or synthetic image data. The renderer only resamples the user's own original camera pixels, preserving their natural skin tone, lip color, and texture.
- Head-angle handling: use `poseEstimator.ts`'s frontal/off-angle estimate (and MediaPipe's tracking confidence) to reduce the effect's intensity, or fall back to the unmodified raw frame entirely, when the face is turned to a strong angle or tracking confidence drops. Do not assume the same on-screen displacement looks anatomically right at every head angle.
- Privacy: process everything locally in the browser for this phase. No camera frame or landmark data is transmitted to a server or stored anywhere; there is no backend in this phase.
- Product positioning (for later, not required to build now, but don't contradict it): if this is ever shown to real patients or surgeons, it must clearly state the output is a visual simulation, not a prediction or guarantee of surgical results.

## 7. Explicitly Out of Scope For This Plan

- Chin/genioplasty, rhinoplasty, or any other surgery module.
- 3D rendering or any depth/projection simulation.
- WebGL rendering (revisit only after Canvas 2D is measured and found insufficient — do not pre-emptively build it).
- Open-mouth / expression-aware deformation, blendshape-based gating (blendshapes are intentionally left disabled in Phase 1).
- Any backend, account system, or persistence of camera or landmark data.
- Side-profile or three-quarter-view–specific handling (frontal / near-frontal only; off-angle is handled only by reducing/disabling the effect, per Section 6).

## 8. Testing / Definition of Done for the Whole Phase

- [ ] Mesh triangle count and connectivity are provably constant across frames (log or assert the count once at startup and periodically afterward; they must always match).
- [ ] Landmark jitter is visibly reduced versus raw MediaPipe output when the face is held still (compare the debug overlay with the One Euro Filter on vs. off).
- [ ] Each of the four sliders produces a visible, isolated effect, with mouth corners stable except when width is adjusted.
- [ ] No visible seam or tearing at the mesh boundary across the tested slider range.
- [ ] Teeth and surrounding skin remain visually unaffected by lip slider changes, for neutral closed-mouth test subjects.
- [ ] Effect tested on at least 5 different test subjects / reference images or videos varying in skin tone, lighting, and presence/absence of facial hair near the mouth.
- [ ] No camera frame or landmark data leaves the browser (verify via the network tab — zero outgoing requests tied to camera or landmark data).
- [ ] Reset returns all sliders and the rendered output to the unmodified camera view.
- [ ] Before/after toggle works correctly and instantly.
- [ ] React DevTools confirms the render loop does not trigger React re-renders on every frame (see Phase 6's done condition).
