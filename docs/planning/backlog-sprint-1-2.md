# Backlog Plan: Sprint 1-2

## 1. Planning Assumptions

- Sprint length: 2 weeks each
- Team roles: PM, BA, Senior Fullstack (FE+BE), QA support (shared)
- Priority objective: MVP export flow end-to-end

## 2. Epic Breakdown

1. EPIC-A: Product Spec and Delivery Setup
2. EPIC-B: Media Upload and Audio Analysis
3. EPIC-C: Scene Editor (Format, Particles, Equalizer, Poster)
4. EPIC-D: Save/Load Projects + Templates
5. EPIC-E: Render Pipeline and Export
6. EPIC-F: Quality, Observability, Release Readiness

## 3. Sprint 1 (Foundation + Core Flow)

### Sprint Goal

Deliver working vertical slice: upload -> analyze -> preview core scene -> save project.

### BA Tasks

1. Finalize acceptance criteria for all MVP user stories.
2. Define template catalog (5-8 presets) with lightweight style descriptions.
3. Freeze configuration schema for particles/equalizer/poster.
4. Validate API contracts against user flow and NFRs.

### Fullstack Tasks

1. Implement upload endpoints for track and poster.
2. Implement audio analysis pipeline and analysis status endpoint.
3. Implement project create/load/update endpoints.
4. Build editor shell with format switch (TikTok/YouTube).
5. Implement poster center + blurred background rendering.
6. Implement initial equalizer rendering from analysis data.

### PM Tasks

1. Break down work into task briefs with owners/deadlines.
2. Run daily status control and blocker tracking.
3. Escalate unresolved blockers within 4 hours.
4. Run sprint demo checklist and acceptance pre-gate.

### Sprint 1 Deliverables

1. API for upload/analyze/project management.
2. Basic editor preview with correct layer ordering.
3. Persisted project reload.
4. Template list endpoint and at least 3 seeded templates.

### Sprint 1 Definition of Done

1. End-to-end manual flow works locally.
2. Core acceptance criteria for upload/analyze/preview/save pass.
3. No P1 blocker open.

## 4. Sprint 2 (Export + Hardening)

### Sprint Goal

Deliver export-ready MVP: template complete set, MP4 render pipeline, status/download, quality controls.

### BA Tasks

1. Finalize export profile rules (HD/FHD, TikTok/YouTube).
2. Approve watermark behavior matrix and premium-ready toggle requirements.
3. Validate final acceptance checklist and launch criteria.

### Fullstack Tasks

1. Implement async render queue/job lifecycle.
2. Implement `/api/render` create/status/download endpoints.
3. Implement watermark toggle via environment variable.
4. Complete template pack to 5-8 presets and apply flow in UI.
5. Add render observability logs and failure diagnostics.
6. Add local cleanup policy for stale files.

### PM Tasks

1. Control readiness gates for release candidate.
2. Track risk burndown and mitigation completion.
3. Run formal acceptance gate (critical tasks require stakeholder approval).
4. Publish final stakeholder report with go/no-go recommendation.

### Sprint 2 Deliverables

1. MP4 export in four target profiles at 30fps.
2. Stable render status and downloadable outputs.
3. Watermark behavior controlled via env.
4. Full template set (5-8) available in UI.

### Sprint 2 Definition of Done

1. Export acceptance criteria pass for all profiles.
2. Watermark toggle verified.
3. Blocking defects resolved or accepted with explicit sign-off.

## 5. Risk Register (Execution)

1. Heavy render times for long audio.

- Owner: Fullstack
- Action: queue + chunk strategy + retries

2. Scope expansion from visual customization.

- Owner: PM/BA
- Action: strict MVP boundary and backlog spillover

3. Local storage saturation.

- Owner: Fullstack
- Action: file retention and cleanup jobs

## 6. Milestones

1. M1 (End Sprint 1): core creation flow validated.
2. M2 (Mid Sprint 2): render pipeline integration complete.
3. M3 (End Sprint 2): acceptance gate passed and release ready.

## 7. Fast-Track Extension: Realtime Preview + Timeline v1

### Objective

Добавить realtime preview и timeline editing (waveform, playhead, trim, keyframes) с максимальной близостью к export.

### Delivery Mode

- Подход: phased delivery в 3 инкремента (M1 -> M2 -> M3).
- Критерий качества: audio/video drift <= 33 ms на desktop.

### Workstream (Post Sprint 2)

1. WS-1: Preview engine sync loop (audio clock master).
2. WS-2: Timeline UI (waveform/playhead/trim).
3. WS-3: Keyframes interpolation and state management.
4. WS-4: Project API persistence for timeline/keyframes.
5. WS-5: Observability + benchmark + regression safety net.

### Execution Notes

- Детальный execution plan: `docs/planning/implementation-plan-realtime-preview-timeline-v1.md`.
- Детальная техническая спецификация: `docs/technical/TECHSPEC-realtime-preview-timeline-v1.md`.
- Готовый prompt для реализации через developer skill:
  `docs/planning/prompt-senior-fullstack-realtime-preview-timeline-v1.md`.
