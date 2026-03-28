# Technical Documentation: Realtime Preview + Track Timeline v1

## 1. Context

- Request source: расширение MVP функционала редактора.
- Objective: добавить realtime preview после настройки сцены и таймлайн трека.
- Related systems: `audio-analysis`, `projects` API, render pipeline.

## 2. Current State

- Existing behavior:
  - Есть upload/analyze/project/render API и базовый preview сцены.
  - Проект хранит конфиги частиц/эквалайзера/постера.
- Known limitations:
  - Нет полноценного realtime playback управления дорожкой.
  - Нет waveform, trim, keyframes в editor UX.

## 3. Target State

- Desired behavior:
  - Пользователь запускает realtime preview и видит синхронный audio-reactive визуал.
  - Пользователь управляет треком через timeline (waveform, playhead, trim, keyframes).
- User flow changes:
  - После загрузки трека и анализа доступен timeline panel.
  - Изменения timeline/keyframes сохраняются в проект и восстанавливаются позже.

## 4. Architecture Impact

- Components affected:
  - Frontend preview player (clock/sync loop)
  - Timeline UI module
  - Keyframe interpolation module
  - Project persistence layer
- Integration points:
  - `/api/audio/analyze/:analysisId` для waveform/тайминга
  - `/api/projects/:projectId` GET/PATCH для timeline/keyframes
- Data flow updates:
  - Load project + analysis
  - Build/cached waveform representation
  - Run playback loop (audio clock -> scene time)
  - Persist timeline/keyframes via project update

## 5. Data And Contracts

- Data model changes (project payload):
  - `timeline`:
    - `zoom`
    - `scroll`
    - `trimInMs`
    - `trimOutMs`
    - `playheadMs` (optional)
  - `keyframes`:
    - Массив параметров
    - Точки: `timeMs`, `value`, `easing`
- API/contract changes:
  - PATCH project принимает частичные изменения `timeline` и `keyframes`
  - GET project возвращает актуальные `timeline` и `keyframes`
  - Validation:
    - `0 <= trimInMs < trimOutMs <= trackDurationMs`
    - `timeMs` каждой keyframe внутри trim или полного трека
    - значения параметров внутри допустимых диапазонов
- Backward compatibility:
  - Отсутствие `timeline`/`keyframes` трактуется как legacy проект.
  - Дефолты применяются на чтении без миграции данных офлайн.

## 6. Implementation Notes

- Key technical decisions:
  - Единая scene-модель для preview и export.
  - Audio clock является master clock.
  - Интерполяция keyframes deterministic для тестируемости.
- Trade-offs:
  - Сложнее и дольше, чем упрощенный preview, но выше предсказуемость.
- Rejected alternatives:
  - Отдельный lightweight preview engine (слишком высокий риск mismatch).

## 7. Security And Compliance

- Data sensitivity: без новых чувствительных данных.
- AuthN/AuthZ changes: нет для MVP.
- Compliance considerations:
  - Валидация пользовательских payload для timeline/keyframes.
  - Защита от некорректных диапазонов времени и oversized payload.

## 8. Observability

- Logs:
  - `preview_start`, `preview_pause`, `preview_seek`, `trim_change`, `keyframe_change`, `preview_error`
- Metrics:
  - `preview_startup_ms`
  - `audio_video_drift_ms`
  - `preview_fps`
  - `preview_frame_drop_rate`
- Alerts:
  - Drift > 33 ms в целевом процентиле
  - Рост `preview_error` выше baseline

## 9. Rollout And Rollback

- Rollout strategy:
  - Feature flag `preview_timeline_v1`
  - Internal enable -> staged rollout -> default on
- Feature flags:
  - `preview_timeline_v1` (UI + runtime path)
- Rollback plan:
  - Disable flag и вернуть legacy preview path
  - Сохраненные timeline/keyframes остаются в проекте, но игнорируются legacy UI

## 10. Test Strategy

- Unit:
  - keyframe interpolation
  - trim/time boundary validation
  - clock conversion utilities
- Integration:
  - playback loop + seek + trim + persistence
- E2E:
  - complete flow: configure -> play preview -> edit timeline -> save/reload -> export smoke
- Non-functional:
  - drift/load/fps benchmarks на desktop reference environment

## 11. Acceptance Criteria

1. Пользователь может воспроизвести preview в реальном времени после настройки.
2. Рассинхрон audio/video не превышает 33 ms в целевых desktop сценариях.
3. Таймлайн поддерживает waveform, playhead, trim in/out.
4. Keyframes применяются к параметрам и воспроизводятся предсказуемо.
5. Timeline/keyframes сохраняются и корректно восстанавливаются из проекта.
6. Визуальная и тайминговая близость preview к export подтверждена тестами.

## 12. Open Questions

- Keyframes v1 параметры: `equalizer.width`, `equalizer.height`, `equalizer.y`.
- Snapping: не включен в v1, остается в backlog.
- Лимиты keyframes: до 16 параметрических треков, до 200 точек на трек.
