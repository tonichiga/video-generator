# Prompt For Senior Fullstack Developer Skill

Ниже контекст и задача для реализации. Выполняй как senior fullstack feature delivery.

## Context docs (read first)

1. `docs/planning/implementation-plan-realtime-preview-timeline-v1.md`
2. `docs/technical/TECHSPEC-realtime-preview-timeline-v1.md`
3. `docs/PRD-TECHSPEC-v1.md`
4. `docs/api/contracts-v1.md`

## Objective

Реализовать v1 функционал realtime preview и timeline трека в текущем Next.js проекте так, чтобы preview был максимально близок к итоговому export.

## Must-have requirements

- Browser realtime playback после настройки сцены.
- Sync target: audio/video drift <= 33 ms (desktop).
- Timeline v1: waveform + playhead + trim in/out + keyframes.
- Полное сохранение и восстановление timeline/keyframes через project API.
- Сохранить текущие layering rules и совместимость существующих проектов.

## Technical constraints

- Stack: Next.js App Router + existing API routes in app/api.
- Keep existing contracts backward compatible.
- No auth addition in scope.
- Prefer shared scene model for preview/export parity.
- Use feature flag: `preview_timeline_v1`.

## Required delivery format

Верни результат в порядке:

1. Clarifications needed (только блокеры)
2. Feature understanding summary
3. Architecture and implementation strategy
4. Frontend implementation plan
5. Backend and integration plan
6. Algorithm design section (clock sync + keyframe interpolation)
7. Testing, observability, rollout, rollback
8. Suggested improvements (in-scope vs backlog)
9. Final execution checklist

## Implementation expectations

- Предложи и реализуй минимально рискованный инкрементный rollout: M1 -> M2 -> M3.
- Покрой acceptance criteria тестами (unit/integration/e2e где уместно).
- Добавь observability по preview drift/fps/startup.
- Если обнаружишь конфликт с текущей архитектурой, предложи корректировку и обоснуй.

## Done criteria

- Все acceptance criteria из техдока покрыты кодом и проверками.
- Нет регрессий существующего upload/analyze/render flow.
- Документация и API контракты обновлены при изменениях.
