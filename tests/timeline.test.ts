import assert from "node:assert/strict";
import test from "node:test";

import {
  applyKeyframesToEqualizer,
  downsampleWaveform,
  getDefaultTimeline,
} from "@/lib/domain/timeline";
import {
  defaultTimelineForTrack,
  parseKeyframes,
  parseTimelineState,
} from "@/lib/server/timeline-validation";

test("getDefaultTimeline uses full duration bounds", () => {
  const timeline = getDefaultTimeline(240000);

  assert.equal(timeline.trimInMs, 0);
  assert.equal(timeline.trimOutMs, 240000);
  assert.equal(timeline.playheadMs, 0);
  assert.equal(timeline.zoom, 1);
});

test("applyKeyframesToEqualizer interpolates with easing and clamps result", () => {
  const result = applyKeyframesToEqualizer(
    {
      x: 0.5,
      y: 0.5,
      width: 0.3,
      height: 0.1,
      color: "#FFFFFF",
    },
    [
      {
        parameter: "equalizer.height",
        points: [
          { timeMs: 0, value: 0.1, easing: "linear" },
          { timeMs: 1000, value: 0.3, easing: "easeInOut" },
        ],
      },
      {
        parameter: "equalizer.width",
        points: [
          { timeMs: 0, value: 0.2, easing: "linear" },
          { timeMs: 1000, value: 2, easing: "linear" },
        ],
      },
    ],
    500,
  );

  assert.ok(result.height > 0.1 && result.height < 0.3);
  assert.equal(result.width, 1);
});

test("downsampleWaveform returns requested density", () => {
  const values = Array.from({ length: 1000 }, (_, index) => (index % 17) / 17);
  const bins = downsampleWaveform(values, 200);

  assert.equal(bins.length, 200);
  assert.ok(bins.every((value) => value >= 0 && value <= 1));
});

test("parseTimelineState validates trim order", () => {
  const fallback = defaultTimelineForTrack(180000);
  const parsed = parseTimelineState(
    {
      trimInMs: 120000,
      trimOutMs: 60000,
    },
    180000,
    fallback,
  );

  assert.equal(parsed, null);
});

test("parseKeyframes rejects points outside trim range", () => {
  const timeline = defaultTimelineForTrack(120000);
  timeline.trimInMs = 10000;
  timeline.trimOutMs = 50000;

  const parsed = parseKeyframes(
    [
      {
        parameter: "equalizer.y",
        points: [{ timeMs: 9000, value: 0.2, easing: "linear" }],
      },
    ],
    {
      timeline,
      trackDurationMs: 120000,
    },
  );

  assert.equal(parsed, null);
});

test("parseKeyframes accepts sorted result", () => {
  const timeline = defaultTimelineForTrack(60000);

  const parsed = parseKeyframes(
    [
      {
        parameter: "equalizer.width",
        points: [
          { timeMs: 25000, value: 0.6, easing: "easeInOut" },
          { timeMs: 10000, value: 0.2, easing: "linear" },
        ],
      },
    ],
    {
      timeline,
      trackDurationMs: 60000,
    },
  );

  assert.ok(parsed);
  assert.equal(parsed?.[0].points[0].timeMs, 10000);
  assert.equal(parsed?.[0].points[1].timeMs, 25000);
});
