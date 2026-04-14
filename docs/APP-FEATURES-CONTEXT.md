# App Features Context

Краткий контекст проекта для агента перед выполнением задач.

## Что уже реализовано

- Canvas-слой генерирует фон и постер.
- Аудио-визуалайзер синхронизирован с треком.
- Пульсация постера под бит.
- Настройки для визуальных и аудио-параметров.
- Полная синхронизация с серверным рендером.

## Ключевые модули и где искать

- UI редактора: app/editor/components/ (EditorPanel.tsx, PreviewPanel.tsx)
- Типы и API editor: app/editor/ (types.ts, api.ts, constants.ts, utils.ts)
- Домен таймлайна и визуализации: lib/domain/ (timeline.ts, visualizer.ts, spectrum.ts, beat-pulse.ts)
- Серверная логика рендера и медиа: lib/server/ (render.ts, media.ts, storage.ts, repository.ts)
- API роуты (render/audio/upload/system): app/api/
- Валидация таймлайна: lib/server/timeline-validation.ts

## Важно для изменений

- Клиентский предпросмотр и серверный рендер должны оставаться синхронизированными.
- При изменениях визуализации проверять влияние на render pipeline и API контракты.

## Идеи динамики для серверного рендера (с пометкой синхронизации)

Легенда:

- SYNC_1_1: можно сделать детерминированно и синхронизировать preview <-> server практически кадр-в-кадр.
- SYNC_WITH_RISK: синхронизация возможна, но потребуется доп. ограничения/калибровка.

### Рекомендуемые эффекты

- Camera Punch (микро-зум на бит) — SYNC_1_1 — DONE
- Parallax Drift (дрейф слоев глубины) — SYNC_1_1 — DONE
- Spectrum Glow (свечение от high-band энергии) — SYNC_1_1 — DONE
- Low-End Shake (легкий shake от баса) — SYNC_1_1 — DONE
- Beat Strobe Soft (мягкий импульс яркости/контраста) — SYNC_1_1
- Dynamic Vignette (виньетка от loudness) — SYNC_1_1
- Auto-Cut Presets (переключение пресетов на сегментах) — SYNC_1_1
- Reactive Color Grade (цветокор от спектральных признаков) — SYNC_1_1
- Tempo-Synced Grain/Noise (зерно по темпу) — SYNC_WITH_RISK
- Chromatic Pulse (легкий RGB split на пиках) — SYNC_WITH_RISK
- Motion Trails (короткие шлейфы движения) — SYNC_WITH_RISK
- Peak Freeze Frame (акцентная микро-заморозка 1-2 кадра) — SYNC_WITH_RISK

### Что точно реализуемо на текущем стеке

- Да, эффекты уровня SYNC_1_1 реализуемы на текущем стеке (lib/server/render.ts + Sharp + FFmpeg + общие доменные расчеты в lib/domain/\*).
- Для preview используется тот же таймлайн/аудио-анализ, поэтому при общей формуле расчета параметров ожидаем совпадение с сервером.

### Ограничения и условия для SYNC_WITH_RISK

- Нужна строгая детерминированность: fixed fps, одинаковые коэффициенты сглаживания, seed для noise.
- Нельзя опираться только на CSS transition для критичных параметров; важные анимации считать по времени кадра.
- Для эффектов со смешением кадров (trail/freeze) требуется единая формула на клиенте и сервере, иначе возможен визуальный сдвиг.
