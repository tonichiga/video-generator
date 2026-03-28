# Developer Start Handoff (MVP)

## 1. Purpose

This document is the execution entry point for Senior Fullstack. Follow it to start implementation immediately with minimal ambiguity.

## 2. Source Documents (Read First)

1. Product and architecture baseline: `docs/PRD-TECHSPEC-v1.md`
2. API contracts: `docs/api/contracts-v1.md`
3. Sprint delivery plan: `docs/planning/backlog-sprint-1-2.md`
4. Next.js custom rules in this repo: `AGENTS.md`

## 3. Confirmed MVP Constraints

1. Anonymous mode only.
2. Local storage only for this phase.
3. Video duration equals full track duration (no product-level cap).
4. Export profiles: TikTok and YouTube, HD/FHD, 30fps.
5. Watermark behavior via `WATERMARK_ENABLED`.
6. Built-in templates: 5-8.

## 4. Implementation Order (Critical Path)

Execute in this exact order unless PM approves re-sequencing.

1. Foundation and schema

- Define shared scene schema used by preview and renderer.
- Add domain entities for project, asset, analysis, render job, template.

2. Upload module

- Implement track and poster upload endpoints.
- Add validation for MIME, corrupted payloads, and file safety.

3. Audio analysis module

- Implement analysis pipeline and async status endpoint.
- Persist analysis artifacts for equalizer playback.

4. Project module

- Implement create/get/patch project endpoints.
- Bind project ownership to anonymous `clientToken`.

5. Editor core UI

- Format switch (TikTok/YouTube).
- Layering model:
  - blurred poster background
  - particles
  - equalizer
  - centered poster (must stay above equalizer)

6. Visual customization

- Particle preset selection + minimal customization.
- Equalizer customization (position, size, color).

7. Templates

- Seed 5-8 templates.
- Implement template listing and apply flow.

8. Render pipeline

- Async render job lifecycle (`queued`, `processing`, `done`, `failed`).
- Implement status and download endpoints.
- Ensure output MP4 profile mapping works for all four targets.

9. Watermark switch

- Respect `WATERMARK_ENABLED` in render stage.
- Expose applied watermark state in job status/logs.

10. Hardening

- Add render diagnostics and basic metrics.
- Add local cleanup policy for stale artifacts.

## 5. Definition Of Ready (Before Coding)

1. Scene schema is frozen for current sprint.
2. API contracts for first 4 modules are accepted.
3. BA has provided template catalog draft.
4. PM has created task briefs with owner and deadline.

## 6. Definition Of Done (Per Feature)

1. Endpoint/UI behavior matches acceptance criteria in PRD.
2. Positive and negative cases tested locally.
3. Logs are sufficient to diagnose failure.
4. No regression against layering invariant.
5. Feature included in daily status report with evidence.

## 7. Local Environment Checklist

1. Install dependencies.
2. Run Next.js dev server.
3. Prepare local directories for uploads/analysis/renders.
4. Set environment variables:

- `WATERMARK_ENABLED=true`
- `LOCAL_STORAGE_ROOT=./local-storage`
- `RENDER_CONCURRENCY=1`

## 8. Suggested Task Breakdown For First 3 Working Days

## Day 1

1. Create shared schema/types and local storage abstraction.
2. Implement `/api/upload/track` and `/api/upload/poster`.
3. Add basic validation and error envelope.

## Day 2

1. Implement `/api/audio/analyze` and status endpoint.
2. Implement `/api/projects` create/get/patch.
3. Add initial editor shell and format switch.

## Day 3

1. Add poster layers and equalizer preview integration.
2. Add particles and minimal customization.
3. Verify save/load with current editor state.

## 9. Quality Gates

1. Gate A (end of Day 2): upload + analyze + project persistence work end-to-end.
2. Gate B (end of Day 3): preview layering and basic customization are stable.
3. Gate C (before sprint demo): at least one full export path validated.

## 10. Risk Controls

1. Long audio render risk

- Keep render async and design for chunk/resume.

2. Preview/render mismatch risk

- Use one shared scene schema for both paths.

3. Local storage growth risk

- Add cleanup command and retention policy.

## 11. Handoff Format For Status Updates

Every update must include:

1. Completed tasks
2. In-progress tasks
3. Blockers
4. Evidence links (log excerpt, screenshot, API response)
5. Next 24h plan

## 12. Immediate Start Command Set

```bash
npm install
npm run dev
```
