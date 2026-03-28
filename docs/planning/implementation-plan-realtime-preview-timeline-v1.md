# Implementation Plan: Realtime Preview + Track Timeline v1

## 1. Problem Statement

- Summary: расширить видеоредактор, чтобы пользователь мог воспроизводить сцену в реальном времени после настройки и управлять дорожкой через таймлайн.
- Business value: сокращение цикла итераций, рост предсказуемости итогового рендера, повышение конверсии в экспорт.
- Success metrics:
  - audio/video drift в preview <= 33 ms на desktop
  - startup preview <= 500 ms после Play
  - восстановление timeline state из проекта в 100% позитивных сценариев

## 2. Scope

- In scope:
  - Browser realtime preview engine (desktop-first)
  - Track timeline: waveform, playhead, trim in/out
  - Keyframes v1 для ограниченного набора параметров
  - Полное сохранение timeline/keyframes в проект
  - Максимальная визуальная близость preview к export
- Out of scope:
  - Mobile production hardening
  - Multitrack editing
  - Collaborative editing
  - Автоматический beat-driven монтаж

## 3. Requirements Breakdown

- Functional:
  - Пользователь может Play/Pause/Seek preview.
  - Пользователь видит waveform и позицию playhead.
  - Пользователь может задать trim in/out и воспроизводить внутри диапазона.
  - Пользователь может добавить keyframes и получить интерполяцию параметров.
  - Timeline и keyframes сохраняются/восстанавливаются через project API.
- Non-functional:
  - Drift <= 33 ms.
  - UI latency на действия таймлайна <= 100 ms в типовом сценарии.
  - First preview frame <= 500 ms после Play.
  - Стабильность: отсутствие критичных ошибок минимум в 95% локальных сессий.
- Constraints:
  - Текущий MVP без auth.
  - Сохранение текущих API принципов и локальной архитектуры.
  - Поставка максимально быстро, с фазированием.
- Dependencies:
  - Доступный audio analysis для трека.
  - Текущие project endpoints и схема проекта.
  - Render pipeline и server-side инварианты layering.

## 4. Delivery Options

- Option A (preferred): общая scene-модель для preview/export, realtime рендер в браузере.
  - Trade-off: сложнее в реализации, но минимизирует preview/export mismatch.
- Option B (fallback): отдельный упрощенный preview pipeline.
  - Trade-off: быстрее старт, выше риск расхождений и техдолга.

## 5. Work Plan

| Phase     | Task                                                   | Owner Role    | Dependency | Effort (S/M/L) | Notes                          |
| --------- | ------------------------------------------------------ | ------------- | ---------- | -------------- | ------------------------------ |
| Discovery | Утвердить набор параметров keyframes v1                | BA + ENG      | None       | S              | Минимальный, но полезный набор |
| Discovery | Зафиксировать KPI (drift/startup/fps)                  | BA + ENG + QA | None       | S              | Входит в DoD                   |
| Design    | Спроектировать timeline schema + keyframe schema       | ENG           | Discovery  | M              | С обратной совместимостью      |
| Design    | Подготовить API contract update для проекта            | ENG           | Discovery  | S              | PATCH/GET project              |
| Build     | Реализовать preview player loop (play/pause/seek/sync) | ENG           | Design     | L              | Audio clock master             |
| Build     | Реализовать waveform + playhead + trim UI              | ENG           | Design     | M              | Desktop-first UX               |
| Build     | Реализовать keyframes + interpolation                  | ENG           | Design     | L              | Deterministic behavior         |
| Build     | Сохранение/восстановление timeline state               | ENG           | API update | M              | Через project endpoints        |
| QA        | Покрыть unit/integration/E2E и замеры drift            | QA + ENG      | Build      | M              | Golden-frame проверки          |
| Release   | Включить через feature flag preview_timeline_v1        | ENG + Ops     | QA         | S              | Поэтапное включение            |

## 6. Milestones

- M1: Play/Pause/Seek + waveform/playhead, без keyframes.
- M2: Trim + persistence + server validation.
- M3: Keyframes + observability + stabilization.

## 7. Risks And Mitigations

| Risk                                 | Likelihood | Impact | Mitigation                                     | Owner    |
| ------------------------------------ | ---------- | ------ | ---------------------------------------------- | -------- |
| Деградация preview на длинных треках | Medium     | High   | Кэш waveform, quality fallback, профилирование | ENG      |
| Рассинхрон audio/video при seek      | Medium     | High   | Audio clock master + периодическая коррекция   | ENG      |
| Preview/export визуально расходятся  | Medium     | High   | Shared scene schema + golden-frame tests       | ENG + QA |
| Сложность состояния проекта растет   | High       | Medium | Жесткая схема, лимиты, валидация               | ENG      |

## 8. Acceptance Criteria Mapping

| Requirement      | Acceptance Criteria                                           | Validation Method                |
| ---------------- | ------------------------------------------------------------- | -------------------------------- |
| Realtime preview | Запуск preview воспроизводит сцену с аудио в реальном времени | E2E сценарий                     |
| Sync quality     | Drift audio/video <= 33 ms                                    | Инструментальные тесты + метрики |
| Timeline basics  | Waveform и playhead корректно отображаются и seek работают    | Integration tests                |
| Trim             | Воспроизведение ограничивается trim in/out                    | Unit + integration               |
| Keyframes        | Параметры изменяются по timeline предсказуемо                 | Unit + golden-frame              |
| Persistence      | Timeline/keyframes восстанавливаются после reload проекта     | API + E2E                        |
| Parity           | Слойность и ключевые кадры близки к export                    | Golden-frame + smoke export      |
