# Video Generator Service: PRD + Tech Spec v1

## 1. Document Status

- Version: v1.0
- Date: 2026-03-28
- Product phase: MVP
- Stack baseline: Next.js (App Router) + Next API in `server` folder

## 2. Product Goal

Build a web service that generates music-driven videos with animated particles and an audio-reactive equalizer, allowing users to export final output as MP4.

## 3. User Story (Consolidated)

A user opens the site, chooses output format (TikTok or YouTube), selects particle style with minimal customization, uploads a track, gets an equalizer generated from audio analysis, customizes equalizer position/size/color, uploads poster artwork, sees center poster plus blur cover background, and exports MP4 with all effects applied.

## 4. Confirmed Product Decisions

1. Video duration = full audio track duration (no product-level time limit).
2. Anonymous mode for MVP (no login).
3. Save projects and support quick-start templates.
4. Export profiles: TikTok + YouTube in HD/FHD, 30fps.
5. Watermark controlled by environment variable and can be disabled for premium mode.
6. Runtime now: local. Future target: serverless + Supabase CDN/storage.
7. Codec baseline accepted: H.264 + AAC in MP4 container.

## 5. Scope

### In Scope (MVP)

- Anonymous user flow.
- Upload audio track and poster image.
- Audio analysis for equalizer animation.
- Visual editor with:
  - Aspect ratio switch: TikTok (9:16), YouTube (16:9)
  - Particle preset selection + minimal customization
  - Equalizer customization (position, size, color)
  - Poster center layer + blurred cover background
  - Fixed layering rule: equalizer z-index below center poster
- Save/load project configurations.
- 5-8 built-in visual templates.
- Export MP4 in HD/FHD at 30fps.
- Watermark toggle via environment variable.

### Out of Scope (MVP)

- Authentication and billing.
- Team collaboration/multi-user editing.
- Advanced VFX graph editor.
- Real-time cloud collaboration.

## 6. Functional Requirements

1. User can create a project and choose target format profile.
2. User can upload valid track/audio and poster/image files.
3. System analyzes audio and produces equalizer-ready time-series data.
4. User can preview scene with particles, equalizer, and poster layering.
5. User can minimally customize particles.
6. User can customize equalizer position/size/color.
7. User can save and re-open project settings.
8. User can apply one of 5-8 templates as quick start.
9. User can launch export and track render status.
10. User can download final MP4 when render is complete.

## 7. Non-Functional Requirements

1. Reliability: render jobs must be resumable/retriable in async flow.
2. Performance: support HD/FHD at 30fps with stable export completion.
3. Compatibility: output playable on major platforms (H.264/AAC, yuv420p).
4. Observability: job lifecycle logs + render metrics + failure alerts.
5. Security baseline: file type/size validation, path safety, controlled storage paths.

## 8. Data Model (MVP)

### Project

- id
- clientToken
- name
- format (`tiktok` | `youtube`)
- quality (`hd` | `fhd`)
- fps (fixed 30)
- particleConfig (json)
- equalizerConfig (json)
- posterConfig (json)
- watermarkEnabled (boolean)
- templateId (nullable)
- trackAssetId
- posterAssetId
- createdAt, updatedAt

### Asset

- id
- kind (`track` | `poster` | `render`)
- filePath
- mimeType
- size
- durationSec (track only)
- width, height (image/video when applicable)
- checksum
- createdAt

### AudioAnalysis

- id
- trackAssetId
- sampleRate
- frameStepMs
- bands
- envelopeSeriesPath
- spectrumSeriesPath
- createdAt

### RenderJob

- id
- projectId
- status (`queued` | `processing` | `done` | `failed` | `canceled`)
- progress (0-100)
- outputAssetId (nullable)
- errorCode (nullable)
- errorMessage (nullable)
- startedAt, finishedAt

### Template

- id
- name
- category
- particleConfig
- equalizerConfig
- posterConfig
- defaultPalette
- isBuiltIn

## 9. Rendering and Processing Architecture

## 9.1 Local MVP Runtime

- Next.js app + API routes for orchestration.
- Local storage directories for uploads, analysis, renders.
- Local worker process for heavy rendering jobs.
- Async job polling from frontend.

## 9.2 Future Serverless Migration Path

- Keep API contract stable.
- Move assets to Supabase storage/CDN.
- Move workers to queue-driven serverless/background jobs.
- Preserve render job lifecycle states and idempotency semantics.

## 10. Video Profiles

- TikTok FHD: 1080x1920 @30fps
- TikTok HD: 720x1280 @30fps
- YouTube FHD: 1920x1080 @30fps
- YouTube HD: 1280x720 @30fps

## 11. Layering and Visual Rules

1. Background poster layer: blurred, cover mode.
2. Particle layer above background.
3. Equalizer layer above particles, but below center poster.
4. Center poster layer always top-most among visual core elements.

## 12. Watermark Rules

- Environment variable: `WATERMARK_ENABLED`.
- If `true`, watermark is rendered.
- If `false`, watermark is omitted (premium-ready behavior).
- Render logs must include whether watermark was applied.

## 13. API Module Boundaries

- Upload module: track/poster ingestion and validation.
- Analysis module: FFT/envelope extraction and persistence.
- Project module: save/load settings, template apply.
- Render module: enqueue, status, output retrieval.

Detailed contracts are in `docs/api/contracts-v1.md`.

## 14. Acceptance Criteria

1. User can switch TikTok/YouTube and preview updates aspect ratio correctly.
2. User can upload track and poster with validation feedback.
3. Equalizer animates according to analyzed track data.
4. Particle preset and minimal customization affect preview and export.
5. Center poster and blur background render correctly.
6. Equalizer remains below center poster in preview and output.
7. Project can be saved and re-opened.
8. At least 5 built-in templates are available and applicable.
9. Export produces playable MP4 in selected profile.
10. Watermark behavior follows environment configuration.

## 15. Risks and Mitigation

1. Long-duration tracks can create heavy jobs.

- Mitigation: chunked rendering pipeline + resumable jobs.

2. Preview/render mismatch.

- Mitigation: shared scene schema and golden-frame tests.

3. Local storage growth.

- Mitigation: cleanup policy + size monitoring.

4. Future migration complexity.

- Mitigation: storage abstraction and queue abstraction from day one.

## 16. Open Decisions (Non-blocking)

1. Exact file size limits for upload warnings (soft limits).
2. Template style set for final MVP catalog (5-8 options).
3. Cleanup retention window for local rendered files.
