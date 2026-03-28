"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import Image from "next/image";

import {
  applyKeyframesToEqualizer,
  clampNumber,
  getDefaultTimeline,
} from "@/lib/domain/timeline";
import { getVisualizerBarCount } from "@/lib/domain/visualizer";
import type {
  ParticleConfig,
  TimelineKeyframeParameter,
  TimelineKeyframeTrack,
  TimelineState,
} from "@/lib/domain/types";

type TemplateItem = {
  id: string;
  name: string;
  category: string;
  defaultPalette: string[];
  equalizerConfig: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    visualizerType?: VisualizerType;
  };
  particleConfig: {
    preset: ParticleConfig["preset"];
    density: number;
    speed: number;
  };
  posterConfig: {
    cornerRadius: number;
    blurStrength: number;
  };
};

type Format = "tiktok" | "youtube";
type Quality = "hd" | "fhd";
type ParticlePreset = ParticleConfig["preset"];
type VisualizerType = "bars" | "line" | "dots" | "symmetricBars";

type WaveformResponse = {
  analysisId: string;
  frameStepMs: number;
  durationMs: number;
  values: number[];
};

type SpectrumResponse = {
  analysisId: string;
  frameStepMs: number;
  durationMs: number;
  bars: number;
  values: number[][];
};

const defaultClientToken = `cl_${Math.random().toString(36).slice(2, 10)}`;
const defaultDurationMs = 120_000;
const timelineWidth = 1000;
const timelineHeight = 120;
const particlePresetOptions: ParticlePreset[] = [
  "off",
  "fire",
  "geometric",
  "neon",
  "dust",
  "stardust",
  "pulse",
  "retro",
];
const visualizerTypeOptions: VisualizerType[] = [
  "bars",
  "symmetricBars",
  "line",
  "dots",
];

function formatMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function waveformPath(values: number[]) {
  if (values.length === 0) {
    return "";
  }

  const centerY = timelineHeight / 2;
  const usableHeight = timelineHeight * 0.82;
  const maxIndex = Math.max(1, values.length - 1);

  return values
    .map((value, index) => {
      const x = (index / maxIndex) * timelineWidth;
      const y = centerY - clampNumber(value, 0, 1) * (usableHeight / 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function visualizerLinePath(values: number[]) {
  if (values.length === 0) {
    return "";
  }

  const maxIndex = Math.max(1, values.length - 1);

  return values
    .map((value, index) => {
      const x = (index / maxIndex) * 100;
      const y = 100 - clampNumber(value, 0.02, 1) * 92;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function visualizerSymmetricBarHeight(value: number) {
  return `${Math.max(6, Math.round(value * 46))}%`;
}

function normalizeTimeline(
  input: TimelineState | null | undefined,
  durationMs: number,
): TimelineState {
  const boundedDuration = Math.max(100, Math.round(durationMs));
  const fallback = getDefaultTimeline(boundedDuration);

  if (!input) {
    return fallback;
  }

  const trimInMs = clampNumber(
    Math.round(input.trimInMs),
    0,
    boundedDuration - 1,
  );
  const trimOutMs = clampNumber(
    Math.round(input.trimOutMs),
    trimInMs + 1,
    boundedDuration,
  );

  return {
    zoom: clampNumber(input.zoom, 0.5, 8),
    scroll: clampNumber(input.scroll, 0, 1),
    trimInMs,
    trimOutMs,
    playheadMs:
      typeof input.playheadMs === "number"
        ? clampNumber(Math.round(input.playheadMs), trimInMs, trimOutMs)
        : trimInMs,
  };
}

function seededParticles(count: number, seed: string) {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967295;
  };

  return Array.from({ length: count }).map((_, index) => ({
    id: `${seed}_${index}`,
    x: `${Math.round(next() * 1000) / 10}%`,
    y: `${Math.round(next() * 1000) / 10}%`,
    size: `${6 + Math.round(next() * 24)}px`,
    delay: `${Math.round(next() * 2400)}ms`,
    duration: `${3800 + Math.round(next() * 7200)}ms`,
    driftX: `${-26 + Math.round(next() * 52)}px`,
  }));
}

export default function Home() {
  const [clientToken, setClientToken] = useState(defaultClientToken);
  const [projectName, setProjectName] = useState("My Mix #1");
  const [format, setFormat] = useState<Format>("tiktok");
  const [quality, setQuality] = useState<Quality>("fhd");

  const [trackFile, setTrackFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [trackPreviewUrl, setTrackPreviewUrl] = useState<string | null>(null);

  const [trackAssetId, setTrackAssetId] = useState("");
  const [posterAssetId, setPosterAssetId] = useState("");
  const [analysisId, setAnalysisId] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [projectId, setProjectId] = useState("");
  const [renderJobId, setRenderJobId] = useState("");
  const [renderStatus, setRenderStatus] = useState("idle");
  const [renderProgress, setRenderProgress] = useState(0);

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );

  const [equalizerColor, setEqualizerColor] = useState("#FFFFFF");
  const [equalizerWidth, setEqualizerWidth] = useState(0.7);
  const [equalizerHeight, setEqualizerHeight] = useState(0.18);
  const [equalizerY, setEqualizerY] = useState(0.8);
  const [visualizerType, setVisualizerType] = useState<VisualizerType>("bars");

  const [particlePreset, setParticlePreset] = useState<ParticlePreset>("neon");
  const [particleDensity, setParticleDensity] = useState(0.55);
  const [particleSpeed, setParticleSpeed] = useState(0.5);

  const [posterCornerRadius, setPosterCornerRadius] = useState(20);
  const [posterBlurStrength, setPosterBlurStrength] = useState(20);

  const [status, setStatus] = useState("Ready");
  const [isBusy, setIsBusy] = useState(false);

  const [previewTimelineEnabled, setPreviewTimelineEnabled] = useState(false);
  const [trackDurationMs, setTrackDurationMs] = useState(defaultDurationMs);
  const [waveformValues, setWaveformValues] = useState<number[]>([]);
  const [spectrumFrameStepMs, setSpectrumFrameStepMs] = useState(33);
  const [spectrumValues, setSpectrumValues] = useState<number[][]>([]);
  const [timeline, setTimeline] = useState<TimelineState>(() =>
    getDefaultTimeline(defaultDurationMs),
  );
  const [keyframes, setKeyframes] = useState<TimelineKeyframeTrack[]>([]);
  const [selectedKeyframeParameter, setSelectedKeyframeParameter] =
    useState<TimelineKeyframeParameter>("equalizer.height");
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewDriftMs, setPreviewDriftMs] = useState(0);
  const [previewFps, setPreviewFps] = useState(0);
  const [previewStartupMs, setPreviewStartupMs] = useState(0);
  const [visualizerBars, setVisualizerBars] = useState<number[]>(() =>
    Array.from({ length: 32 }).map(() => 0.05),
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playRequestedAtRef = useRef<number | null>(null);
  const playbackStartPerfRef = useRef<number | null>(null);
  const playbackStartAudioMsRef = useRef(0);
  const fpsWindowStartRef = useRef(0);
  const frameCountRef = useRef(0);
  const maxDriftRef = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const visualizerBarCount = useMemo(
    () =>
      getVisualizerBarCount(particlePreset, selectedTemplate?.category ?? ""),
    [particlePreset, selectedTemplate?.category],
  );

  const previewAspectRatio = useMemo(() => {
    return format === "tiktok" ? "9 / 16" : "16 / 9";
  }, [format]);

  const liveEqualizerConfig = useMemo(() => {
    const baseConfig = {
      x: 0.5,
      y: equalizerY,
      width: equalizerWidth,
      height: equalizerHeight,
      color: equalizerColor,
    };

    const playheadMs = timeline.playheadMs ?? timeline.trimInMs;
    return applyKeyframesToEqualizer(baseConfig, keyframes, playheadMs);
  }, [
    equalizerColor,
    equalizerHeight,
    equalizerWidth,
    equalizerY,
    keyframes,
    timeline,
  ]);

  const trimInX = useMemo(
    () => (timeline.trimInMs / trackDurationMs) * timelineWidth,
    [timeline.trimInMs, trackDurationMs],
  );
  const trimOutX = useMemo(
    () => (timeline.trimOutMs / trackDurationMs) * timelineWidth,
    [timeline.trimOutMs, trackDurationMs],
  );
  const playheadX = useMemo(() => {
    const value = timeline.playheadMs ?? timeline.trimInMs;
    return (value / trackDurationMs) * timelineWidth;
  }, [timeline.playheadMs, timeline.trimInMs, trackDurationMs]);

  const trackPlaybackUrl = useMemo(() => {
    if (trackPreviewUrl) {
      return trackPreviewUrl;
    }
    if (trackAssetId) {
      return `/api/assets/${trackAssetId}`;
    }
    return "";
  }, [trackAssetId, trackPreviewUrl]);

  const particleCount = useMemo(() => {
    if (particlePreset === "off") {
      return 0;
    }
    return Math.max(8, Math.round(12 + particleDensity * 44));
  }, [particleDensity, particlePreset]);

  const particleSprites = useMemo(
    () =>
      seededParticles(
        particleCount,
        `${particlePreset}_${selectedTemplateId ?? "default"}`,
      ),
    [particleCount, particlePreset, selectedTemplateId],
  );

  const normalizedVisualizerBars = useMemo(() => {
    if (visualizerBars.length === visualizerBarCount) {
      return visualizerBars;
    }
    return Array.from({ length: visualizerBarCount }).map(
      (_, index) =>
        visualizerBars[index] ??
        visualizerBars[visualizerBars.length - 1] ??
        0.05,
    );
  }, [visualizerBarCount, visualizerBars]);

  const emitPreviewMetric = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      const body = {
        event,
        projectId: projectId || null,
        analysisId: analysisId || null,
        timestamp: new Date().toISOString(),
        ...payload,
      };

      console.info("[preview]", body);
      void fetch("/api/system/preview-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    [analysisId, projectId],
  );

  const stopRenderLoop = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const ensureAudioAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || typeof window === "undefined") {
      return false;
    }

    const AudioContextApi =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextApi) {
      return false;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextApi();
    }

    const context = audioContextRef.current;

    if (!mediaSourceRef.current) {
      mediaSourceRef.current = context.createMediaElementSource(audio);
    }

    if (!analyserRef.current) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      mediaSourceRef.current.connect(analyser);
      analyser.connect(context.destination);
      analyserRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    if (context.state === "suspended") {
      void context.resume();
    }

    return true;
  }, []);

  const updateVisualizerBars = useCallback(
    (now: number) => {
      const audio = audioRef.current;
      if (audio && spectrumValues.length > 0 && spectrumFrameStepMs > 0) {
        const frameIndex = clampNumber(
          Math.floor((audio.currentTime * 1000) / spectrumFrameStepMs),
          0,
          spectrumValues.length - 1,
        );

        const frame = spectrumValues[frameIndex];
        if (Array.isArray(frame) && frame.length > 0) {
          setVisualizerBars(frame.map((value) => clampNumber(value, 0.04, 1)));
          return;
        }
      }

      const analyser = analyserRef.current;
      const data = analyserDataRef.current;

      if (!analyser || !data) {
        const idle = Array.from({ length: visualizerBarCount }).map(
          (_, index) => {
            const wave = Math.sin(now / 480 + index * 0.45) * 0.04;
            return clampNumber(0.08 + wave, 0.04, 0.2);
          },
        );
        setVisualizerBars(idle);
        return;
      }

      analyser.getByteFrequencyData(data as unknown as Uint8Array<ArrayBuffer>);
      const bars = Array.from({ length: visualizerBarCount }).map(
        (_, index) => {
          const start = Math.floor((index * data.length) / visualizerBarCount);
          const end = Math.max(
            start + 1,
            Math.floor(((index + 1) * data.length) / visualizerBarCount),
          );
          let total = 0;
          for (let i = start; i < end; i += 1) {
            total += data[i] ?? 0;
          }
          const value = total / (end - start) / 255;
          return clampNumber(value, 0.04, 1);
        },
      );

      setVisualizerBars(bars);
    },
    [spectrumFrameStepMs, spectrumValues, visualizerBarCount],
  );

  const applyTemplateSettings = useCallback(
    (templateId: string | null, emitEvent: boolean) => {
      setSelectedTemplateId(templateId);

      if (!templateId) {
        return;
      }

      const template = templates.find((item) => item.id === templateId);
      if (!template) {
        return;
      }

      setEqualizerColor(template.equalizerConfig.color);
      setEqualizerWidth(template.equalizerConfig.width);
      setEqualizerHeight(template.equalizerConfig.height);
      setEqualizerY(template.equalizerConfig.y);
      setVisualizerType(template.equalizerConfig.visualizerType ?? "bars");

      setParticlePreset(template.particleConfig.preset);
      setParticleDensity(template.particleConfig.density);
      setParticleSpeed(template.particleConfig.speed);

      setPosterCornerRadius(template.posterConfig.cornerRadius);
      setPosterBlurStrength(template.posterConfig.blurStrength);

      if (emitEvent) {
        emitPreviewMetric("template_change", {
          templateId,
          particlePreset: template.particleConfig.preset,
        });
      }
    },
    [emitPreviewMetric, templates],
  );

  const onAnimationFrame = useCallback(
    (now: number) => {
      const audio = audioRef.current;
      if (!audio) {
        setIsPlaying(false);
        stopRenderLoop();
        return;
      }

      updateVisualizerBars(now);

      if (playbackStartPerfRef.current === null) {
        playbackStartPerfRef.current = now;
        playbackStartAudioMsRef.current = audio.currentTime * 1000;
        fpsWindowStartRef.current = now;
        frameCountRef.current = 0;
        maxDriftRef.current = 0;

        if (playRequestedAtRef.current !== null) {
          const startup = Math.max(
            0,
            Math.round(now - playRequestedAtRef.current),
          );
          setPreviewStartupMs(startup);
          emitPreviewMetric("preview_startup", { startupMs: startup });
          playRequestedAtRef.current = null;
        }
      }

      const currentMs = Math.round(audio.currentTime * 1000);
      const clampedPlayhead = clampNumber(
        currentMs,
        timeline.trimInMs,
        timeline.trimOutMs,
      );

      setTimeline((previous) => ({
        ...previous,
        playheadMs: clampedPlayhead,
      }));

      const expectedMs =
        playbackStartAudioMsRef.current +
        (now - (playbackStartPerfRef.current ?? now));
      const drift = Math.abs(currentMs - expectedMs);
      if (drift > maxDriftRef.current) {
        maxDriftRef.current = drift;
        setPreviewDriftMs(Math.round(drift));
      }

      frameCountRef.current += 1;
      const elapsedWindow = now - fpsWindowStartRef.current;
      if (elapsedWindow >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsedWindow);
        setPreviewFps(fps);
        emitPreviewMetric("preview_runtime", {
          fps,
          driftMs: Math.round(drift),
        });
        fpsWindowStartRef.current = now;
        frameCountRef.current = 0;
      }

      if (currentMs >= timeline.trimOutMs) {
        audio.pause();
        audio.currentTime = timeline.trimInMs / 1000;
        setTimeline((previous) => ({
          ...previous,
          playheadMs: previous.trimInMs,
        }));
        setIsPlaying(false);
        stopRenderLoop();
        emitPreviewMetric("preview_pause", {
          reason: "trim_end",
          maxDriftMs: Math.round(maxDriftRef.current),
          fps: previewFps,
        });
        return;
      }

      rafRef.current = window.requestAnimationFrame(onAnimationFrame);
    },
    [
      emitPreviewMetric,
      previewFps,
      stopRenderLoop,
      timeline.trimInMs,
      timeline.trimOutMs,
      updateVisualizerBars,
    ],
  );

  useEffect(() => {
    setVisualizerBars((previous) =>
      Array.from({ length: visualizerBarCount }).map(
        (_, index) => previous[index] ?? previous[previous.length - 1] ?? 0.05,
      ),
    );
  }, [visualizerBarCount]);

  useEffect(() => {
    let mounted = true;

    void fetch("/api/templates")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load templates");
        }
        const data = (await response.json()) as { items: TemplateItem[] };
        if (mounted) {
          setTemplates(data.items);
          const first = data.items[0];
          if (first) {
            setSelectedTemplateId(first.id);
            setEqualizerColor(first.equalizerConfig.color);
            setEqualizerWidth(first.equalizerConfig.width);
            setEqualizerHeight(first.equalizerConfig.height);
            setEqualizerY(first.equalizerConfig.y);
            setVisualizerType(first.equalizerConfig.visualizerType ?? "bars");
            setParticlePreset(first.particleConfig.preset);
            setParticleDensity(first.particleConfig.density);
            setParticleSpeed(first.particleConfig.speed);
            setPosterCornerRadius(first.posterConfig.cornerRadius);
            setPosterBlurStrength(first.posterConfig.blurStrength);
          }
        }
      })
      .catch(() => {
        if (mounted) {
          setStatus("Template load failed");
        }
      });

    void fetch("/api/system/features")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Feature flags are unavailable");
        }

        const data = (await response.json()) as {
          flags?: { preview_timeline_v1?: boolean };
        };

        if (mounted) {
          setPreviewTimelineEnabled(data.flags?.preview_timeline_v1 === true);
        }
      })
      .catch(() => {
        if (mounted) {
          setPreviewTimelineEnabled(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!posterFile) {
      setPosterPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(posterFile);
    setPosterPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [posterFile]);

  useEffect(() => {
    if (!trackFile) {
      setTrackPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(trackFile);
    setTrackPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [trackFile]);

  useEffect(() => {
    if (
      !analysisId ||
      analysisStatus === "done" ||
      analysisStatus === "failed"
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetch(`/api/audio/analyze/${analysisId}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("poll error");
          }
          const data = (await response.json()) as { status: string };
          setAnalysisStatus(data.status);
          if (data.status === "done") {
            setStatus("Audio analysis complete");
          }
        })
        .catch(() => {
          setAnalysisStatus("failed");
          setStatus("Audio analysis failed");
        });
    }, 1500);

    return () => window.clearInterval(interval);
  }, [analysisId, analysisStatus]);

  useEffect(() => {
    if (analysisStatus !== "done" || !analysisId) {
      setSpectrumValues([]);
      return;
    }

    let canceled = false;

    void fetch(`/api/audio/analyze/${analysisId}/waveform?bins=900`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("waveform unavailable");
        }

        const data = (await response.json()) as WaveformResponse;
        if (canceled) {
          return;
        }

        setWaveformValues(data.values);
        const nextDurationMs = Math.max(
          100,
          data.durationMs || defaultDurationMs,
        );
        setTrackDurationMs(nextDurationMs);
        setTimeline((previous) => normalizeTimeline(previous, nextDurationMs));
      })
      .catch(() => {
        if (!canceled) {
          setWaveformValues([]);
        }
      });

    return () => {
      canceled = true;
    };
  }, [analysisId, analysisStatus]);

  useEffect(() => {
    if (analysisStatus !== "done" || !analysisId) {
      return;
    }

    let canceled = false;

    void fetch(
      `/api/audio/analyze/${analysisId}/spectrum?bars=${visualizerBarCount}&maxFrames=9600`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("spectrum unavailable");
        }

        const data = (await response.json()) as SpectrumResponse;
        if (canceled) {
          return;
        }

        setSpectrumFrameStepMs(Math.max(1, Math.round(data.frameStepMs || 33)));
        setSpectrumValues(Array.isArray(data.values) ? data.values : []);
      })
      .catch(() => {
        if (!canceled) {
          setSpectrumValues([]);
        }
      });

    return () => {
      canceled = true;
    };
  }, [analysisId, analysisStatus, visualizerBarCount]);

  useEffect(() => {
    if (
      !renderJobId ||
      renderStatus === "done" ||
      renderStatus === "failed" ||
      renderStatus === "canceled"
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetch(`/api/render/${renderJobId}/status`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("render poll error");
          }

          const data = (await response.json()) as {
            status: string;
            progress: number;
          };

          setRenderStatus(data.status);
          setRenderProgress(data.progress);

          if (data.status === "done") {
            setStatus("Render complete");
          }
          if (data.status === "failed") {
            setStatus("Render failed");
          }
          if (data.status === "canceled") {
            setStatus("Render canceled");
          }
        })
        .catch(() => {
          setRenderStatus("failed");
          setStatus("Render status polling failed");
        });
    }, 1200);

    return () => window.clearInterval(interval);
  }, [renderJobId, renderStatus]);

  useEffect(() => {
    return () => {
      stopRenderLoop();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, [stopRenderLoop]);

  async function uploadTrack() {
    if (!trackFile) {
      setStatus("Select a track first");
      return;
    }

    const formData = new FormData();
    formData.set("file", trackFile);
    const response = await fetch("/api/upload/track", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Track upload failed");
    }

    const data = (await response.json()) as { assetId: string };
    setTrackAssetId(data.assetId);
  }

  async function uploadPoster() {
    if (!posterFile) {
      setStatus("Select a poster first");
      return;
    }

    const formData = new FormData();
    formData.set("file", posterFile);
    const response = await fetch("/api/upload/poster", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Poster upload failed");
    }

    const data = (await response.json()) as { assetId: string };
    setPosterAssetId(data.assetId);
  }

  async function analyzeTrack() {
    if (!trackAssetId) {
      setStatus("Upload track first");
      return;
    }

    const response = await fetch("/api/audio/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackAssetId,
        bands: 64,
        frameStepMs: 33,
      }),
    });

    if (!response.ok) {
      throw new Error("Analyze request failed");
    }

    const data = (await response.json()) as {
      analysisId: string;
      status: string;
    };

    setAnalysisId(data.analysisId);
    setAnalysisStatus(data.status);
    setStatus("Audio analysis started");
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();

    if (
      !trackAssetId ||
      !posterAssetId ||
      analysisStatus !== "done" ||
      !analysisId
    ) {
      setStatus("Upload files and complete analysis before saving");
      return;
    }

    const payload = {
      clientToken,
      name: projectName,
      format,
      quality,
      fps: 30,
      trackAssetId,
      posterAssetId,
      analysisId,
      templateId: selectedTemplateId,
      equalizerConfig: {
        x: 0.5,
        y: equalizerY,
        width: equalizerWidth,
        height: equalizerHeight,
        color: equalizerColor,
        visualizerType,
      },
      particleConfig: {
        preset: particlePreset,
        density: particleDensity,
        speed: particleSpeed,
      },
      posterConfig: {
        cornerRadius: posterCornerRadius,
        blurStrength: posterBlurStrength,
      },
      timeline: {
        ...timeline,
        playheadMs: timeline.playheadMs ?? timeline.trimInMs,
      },
      keyframes,
    };

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Save project failed");
    }

    const data = (await response.json()) as { projectId: string };
    setProjectId(data.projectId);
    setStatus("Project saved");
  }

  async function loadProject() {
    if (!projectId.trim()) {
      setStatus("Enter project ID first");
      return;
    }

    const response = await fetch(
      `/api/projects/${projectId.trim()}?clientToken=${encodeURIComponent(clientToken)}`,
    );
    if (!response.ok) {
      throw new Error("Load project failed");
    }

    const data = (await response.json()) as {
      name: string;
      format: Format;
      quality: Quality;
      trackAssetId: string;
      posterAssetId: string;
      analysisId: string;
      templateId: string | null;
      equalizerConfig: {
        color: string;
        width: number;
        height: number;
        y: number;
        visualizerType?: VisualizerType;
      };
      particleConfig?: {
        preset?: ParticlePreset;
        density?: number;
        speed?: number;
      };
      posterConfig?: {
        cornerRadius?: number;
        blurStrength?: number;
      };
      timeline?: TimelineState | null;
      keyframes?: TimelineKeyframeTrack[];
    };

    setProjectName(data.name);
    setFormat(data.format);
    setQuality(data.quality);
    setTrackAssetId(data.trackAssetId);
    setPosterAssetId(data.posterAssetId);
    setAnalysisId(data.analysisId);
    setAnalysisStatus("done");
    setSelectedTemplateId(data.templateId);
    setEqualizerColor(data.equalizerConfig.color);
    setEqualizerWidth(data.equalizerConfig.width);
    setEqualizerHeight(data.equalizerConfig.height);
    setEqualizerY(data.equalizerConfig.y);
    setVisualizerType(data.equalizerConfig.visualizerType ?? "bars");
    setParticlePreset(data.particleConfig?.preset ?? "neon");
    setParticleDensity(data.particleConfig?.density ?? 0.55);
    setParticleSpeed(data.particleConfig?.speed ?? 0.5);
    setPosterCornerRadius(data.posterConfig?.cornerRadius ?? 20);
    setPosterBlurStrength(data.posterConfig?.blurStrength ?? 20);
    setTimeline(normalizeTimeline(data.timeline, trackDurationMs));
    setKeyframes(Array.isArray(data.keyframes) ? data.keyframes : []);
    setStatus("Project loaded");
  }

  async function saveTimelineState() {
    if (!projectId.trim()) {
      setStatus("Save or load a project before timeline persistence");
      return;
    }

    const response = await fetch(`/api/projects/${projectId.trim()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientToken,
        timeline: {
          ...timeline,
          playheadMs: timeline.playheadMs ?? timeline.trimInMs,
        },
        keyframes,
      }),
    });

    if (!response.ok) {
      throw new Error("Timeline save failed");
    }

    setStatus("Timeline saved");
  }

  async function runAction(action: () => Promise<void>) {
    try {
      setIsBusy(true);
      await action();
    } catch {
      setStatus("Operation failed. Check input and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function startRender() {
    if (!projectId.trim()) {
      setStatus("Save or load a project first");
      return;
    }

    const syncResponse = await fetch(`/api/projects/${projectId.trim()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientToken,
        templateId: selectedTemplateId,
        equalizerConfig: {
          x: 0.5,
          y: equalizerY,
          width: equalizerWidth,
          height: equalizerHeight,
          color: equalizerColor,
          visualizerType,
        },
        particleConfig: {
          preset: particlePreset,
          density: particleDensity,
          speed: particleSpeed,
        },
        posterConfig: {
          cornerRadius: posterCornerRadius,
          blurStrength: posterBlurStrength,
        },
        timeline: {
          ...timeline,
          playheadMs: timeline.playheadMs ?? timeline.trimInMs,
        },
        keyframes,
      }),
    });

    if (!syncResponse.ok) {
      throw new Error("Render sync failed");
    }

    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectId.trim(),
        clientToken,
        forceRestart: true,
      }),
    });

    if (!response.ok) {
      throw new Error("Render start failed");
    }

    const data = (await response.json()) as {
      renderJobId: string;
      status: string;
      reused?: boolean;
    };

    setRenderJobId(data.renderJobId);
    setRenderStatus(data.status);
    if (!data.reused) {
      setRenderProgress(0);
    }
    setStatus(data.reused ? "Existing render resumed" : "Render started");
  }

  async function cancelRender() {
    if (
      !renderJobId ||
      (renderStatus !== "queued" && renderStatus !== "processing")
    ) {
      setStatus("No active render to cancel");
      return;
    }

    const response = await fetch(`/api/render/${renderJobId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientToken }),
    });

    if (!response.ok) {
      throw new Error("Cancel render failed");
    }

    setRenderStatus("canceled");
    setStatus("Render canceled");
  }

  async function retryRender() {
    if (
      !renderJobId ||
      (renderStatus !== "failed" && renderStatus !== "canceled")
    ) {
      setStatus("Retry is available after failed/canceled render only");
      return;
    }

    const response = await fetch(`/api/render/${renderJobId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientToken }),
    });

    if (!response.ok) {
      throw new Error("Retry render failed");
    }

    const data = (await response.json()) as {
      renderJobId: string;
      status: string;
    };

    setRenderJobId(data.renderJobId);
    setRenderStatus(data.status);
    setRenderProgress(0);
    setStatus("Render retry started");
  }

  function downloadRender() {
    if (!renderJobId || renderStatus !== "done") {
      setStatus("Render is not ready for download");
      return;
    }

    window.open(
      `/api/render/${renderJobId}/download`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !trackPlaybackUrl) {
      setStatus("Upload/load track to enable preview playback");
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      stopRenderLoop();
      setVisualizerBars((previous) => previous.map(() => 0.06));
      emitPreviewMetric("preview_pause", {
        reason: "manual",
        maxDriftMs: Math.round(maxDriftRef.current),
        fps: previewFps,
      });
      return;
    }

    ensureAudioAnalyser();

    const seekMs = clampNumber(
      timeline.playheadMs ?? timeline.trimInMs,
      timeline.trimInMs,
      timeline.trimOutMs,
    );

    audio.currentTime = seekMs / 1000;
    playbackStartPerfRef.current = null;
    playbackStartAudioMsRef.current = seekMs;
    fpsWindowStartRef.current = 0;
    frameCountRef.current = 0;
    maxDriftRef.current = 0;
    playRequestedAtRef.current = performance.now();

    try {
      await audio.play();
      setIsPlaying(true);
      emitPreviewMetric("preview_start", {
        playheadMs: seekMs,
      });
      rafRef.current = window.requestAnimationFrame(onAnimationFrame);
    } catch {
      setStatus("Preview playback blocked by browser");
      emitPreviewMetric("preview_error", { reason: "audio_play_failed" });
    }
  }

  function seekTo(timeMs: number) {
    const clamped = clampNumber(
      Math.round(timeMs),
      timeline.trimInMs,
      timeline.trimOutMs,
    );

    setTimeline((previous) => ({
      ...previous,
      playheadMs: clamped,
    }));

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = clamped / 1000;
    }

    emitPreviewMetric("preview_seek", { playheadMs: clamped });
  }

  function updateTrim(nextTrimInMs: number, nextTrimOutMs: number) {
    setTimeline((previous) => {
      const trimInMs = clampNumber(
        Math.round(nextTrimInMs),
        0,
        trackDurationMs - 1,
      );
      const trimOutMs = clampNumber(
        Math.round(nextTrimOutMs),
        trimInMs + 1,
        trackDurationMs,
      );

      return {
        ...previous,
        trimInMs,
        trimOutMs,
        playheadMs: clampNumber(
          previous.playheadMs ?? trimInMs,
          trimInMs,
          trimOutMs,
        ),
      };
    });

    emitPreviewMetric("trim_change", {
      trimInMs: Math.round(nextTrimInMs),
      trimOutMs: Math.round(nextTrimOutMs),
    });
  }

  function addKeyframe() {
    const playheadMs = Math.round(timeline.playheadMs ?? timeline.trimInMs);

    const valueByParameter: Record<TimelineKeyframeParameter, number> = {
      "equalizer.width": liveEqualizerConfig.width,
      "equalizer.height": liveEqualizerConfig.height,
      "equalizer.y": liveEqualizerConfig.y,
    };

    const nextPoint = {
      timeMs: playheadMs,
      value: valueByParameter[selectedKeyframeParameter],
      easing: "easeInOut" as const,
    };

    setKeyframes((previous) => {
      const copy = [...previous];
      const existingIndex = copy.findIndex(
        (item) => item.parameter === selectedKeyframeParameter,
      );

      if (existingIndex < 0) {
        copy.push({
          parameter: selectedKeyframeParameter,
          points: [nextPoint],
        });
      } else {
        const points = [...copy[existingIndex].points]
          .filter((item) => item.timeMs !== nextPoint.timeMs)
          .concat(nextPoint)
          .sort((a, b) => a.timeMs - b.timeMs);

        copy[existingIndex] = {
          ...copy[existingIndex],
          points,
        };
      }

      return copy;
    });

    emitPreviewMetric("keyframe_change", {
      parameter: selectedKeyframeParameter,
      timeMs: playheadMs,
      action: "add",
    });
  }

  function clearSelectedKeyframes() {
    setKeyframes((previous) =>
      previous.filter((item) => item.parameter !== selectedKeyframeParameter),
    );

    emitPreviewMetric("keyframe_change", {
      parameter: selectedKeyframeParameter,
      action: "clear_parameter",
    });
  }

  const sceneStyle = {
    aspectRatio: previewAspectRatio,
    "--scene-accent-a": selectedTemplate?.defaultPalette?.[0] ?? equalizerColor,
    "--scene-accent-b": selectedTemplate?.defaultPalette?.[1] ?? "#11141f",
    "--scene-accent-c": selectedTemplate?.defaultPalette?.[2] ?? "#d8e8ff",
  } as CSSProperties;

  const sceneBgStyle = {
    backgroundImage: posterPreviewUrl ? `url(${posterPreviewUrl})` : undefined,
    filter: `blur(${Math.max(8, posterBlurStrength)}px) brightness(0.52) saturate(1.05)`,
  } as CSSProperties;

  const eqStyle = {
    left: `${(1 - liveEqualizerConfig.width) * 50}%`,
    width: `${liveEqualizerConfig.width * 100}%`,
    height: `${liveEqualizerConfig.height * 100}%`,
    top: `${liveEqualizerConfig.y * 100}%`,
  } as CSSProperties;

  const equalizerLineD = useMemo(
    () => visualizerLinePath(normalizedVisualizerBars),
    [normalizedVisualizerBars],
  );

  return (
    <main className="editor-root">
      <audio
        ref={audioRef}
        src={trackPlaybackUrl || undefined}
        preload="auto"
      />

      <section className="editor-panel">
        <h1>Video Generator MVP</h1>
        <p className="editor-subtitle">
          Upload track + poster, generate equalizer analysis, then save/load
          project.
        </p>

        <form
          className="editor-grid"
          onSubmit={(event) => void runAction(() => saveProject(event))}
        >
          <label>
            Client token
            <input
              value={clientToken}
              onChange={(e) => setClientToken(e.target.value)}
              required
            />
          </label>

          <label>
            Project name
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
            />
          </label>

          <label>
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
            >
              <option value="tiktok">TikTok 9:16</option>
              <option value="youtube">YouTube 16:9</option>
            </select>
          </label>

          <label>
            Quality
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
            >
              <option value="hd">HD</option>
              <option value="fhd">FHD</option>
            </select>
          </label>

          <label>
            Template
            <select
              value={selectedTemplateId ?? ""}
              onChange={(e) =>
                applyTemplateSettings(e.target.value || null, true)
              }
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Equalizer color
            <input
              type="color"
              value={equalizerColor}
              onChange={(e) => setEqualizerColor(e.target.value)}
            />
          </label>

          <label>
            Equalizer width
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.01}
              value={equalizerWidth}
              onChange={(e) => setEqualizerWidth(Number(e.target.value))}
            />
          </label>

          <label>
            Equalizer height
            <input
              type="range"
              min={0.05}
              max={0.4}
              step={0.01}
              value={equalizerHeight}
              onChange={(e) => setEqualizerHeight(Number(e.target.value))}
            />
          </label>

          <label>
            Equalizer Y
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={equalizerY}
              onChange={(e) => setEqualizerY(Number(e.target.value))}
            />
          </label>

          <label>
            Visualizer type
            <select
              value={visualizerType}
              onChange={(event) =>
                setVisualizerType(event.target.value as VisualizerType)
              }
            >
              {visualizerTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            Particle mode
            <select
              value={particlePreset}
              onChange={(event) =>
                setParticlePreset(event.target.value as ParticlePreset)
              }
            >
              {particlePresetOptions.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>

          <label>
            Particle density
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={particleDensity}
              onChange={(event) =>
                setParticleDensity(Number(event.target.value))
              }
            />
          </label>

          <label>
            Particle speed
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.01}
              value={particleSpeed}
              onChange={(event) => setParticleSpeed(Number(event.target.value))}
            />
          </label>

          <label>
            Background blur
            <input
              type="range"
              min={8}
              max={36}
              step={1}
              value={posterBlurStrength}
              onChange={(event) =>
                setPosterBlurStrength(Number(event.target.value))
              }
            />
          </label>

          <label>
            Poster corner radius
            <input
              type="range"
              min={6}
              max={40}
              step={1}
              value={posterCornerRadius}
              onChange={(event) =>
                setPosterCornerRadius(Number(event.target.value))
              }
            />
          </label>

          <label>
            Track upload
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setTrackFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label>
            Poster upload
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="editor-actions">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction(uploadTrack)}
            >
              Upload Track
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction(uploadPoster)}
            >
              Upload Poster
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction(analyzeTrack)}
            >
              Analyze
            </button>
            <button type="submit" disabled={isBusy}>
              Save Project
            </button>
          </div>

          <div className="editor-actions">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction(startRender)}
            >
              Export MP4
            </button>
            <button
              type="button"
              disabled={isBusy || renderStatus !== "done"}
              onClick={downloadRender}
            >
              Download Render
            </button>
            <button
              type="button"
              disabled={
                isBusy ||
                (renderStatus !== "queued" && renderStatus !== "processing")
              }
              onClick={() => void runAction(cancelRender)}
            >
              Cancel Render
            </button>
            <button
              type="button"
              disabled={
                isBusy ||
                (renderStatus !== "failed" && renderStatus !== "canceled")
              }
              onClick={() => void runAction(retryRender)}
            >
              Retry Render
            </button>
          </div>

          <div className="editor-actions editor-load-row">
            <input
              placeholder="project id"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runAction(loadProject)}
            >
              Load Project
            </button>
            {previewTimelineEnabled ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void runAction(saveTimelineState)}
              >
                Save Timeline
              </button>
            ) : null}
          </div>
        </form>

        <ul className="editor-status-list">
          <li>Status: {status}</li>
          <li>Track asset: {trackAssetId || "-"}</li>
          <li>Poster asset: {posterAssetId || "-"}</li>
          <li>
            Analysis: {analysisId ? `${analysisStatus} (${analysisId})` : "-"}
          </li>
          <li>Project: {projectId || "-"}</li>
          <li>
            Render: {renderJobId ? `${renderStatus} ${renderProgress}%` : "-"}
          </li>
          {previewTimelineEnabled ? (
            <>
              <li>Preview startup: {previewStartupMs} ms</li>
              <li>Preview drift: {previewDriftMs} ms</li>
              <li>Preview fps: {previewFps}</li>
            </>
          ) : null}
        </ul>
      </section>

      <section className="preview-panel">
        <h2>Layer Preview</h2>
        <div className="scene" style={sceneStyle}>
          <div className="scene-bg" style={sceneBgStyle} />
          <div
            className={`scene-particles scene-particles--${particlePreset}`}
            style={
              {
                "--particle-speed-multiplier": `${particleSpeed}`,
              } as CSSProperties
            }
          >
            {particleSprites.map((particle) => (
              <span
                key={particle.id}
                className="scene-particle"
                style={
                  {
                    left: particle.x,
                    top: particle.y,
                    width: particle.size,
                    height: particle.size,
                    animationDelay: particle.delay,
                    animationDuration: particle.duration,
                    "--particle-drift-x": particle.driftX,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className="scene-eq" style={eqStyle}>
            {visualizerType === "line" ? (
              <svg viewBox="0 0 100 100" className="scene-eq-line" role="img">
                <path
                  d={equalizerLineD}
                  stroke={liveEqualizerConfig.color}
                  strokeWidth="2.8"
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            ) : visualizerType === "symmetricBars" ? (
              <div className="scene-eq-symmetric-bars">
                {normalizedVisualizerBars.map((value, index) => (
                  <span key={index} className="scene-eq-symmetric-col">
                    <span
                      className="scene-eq-symmetric-segment scene-eq-symmetric-segment--top"
                      style={{
                        height: visualizerSymmetricBarHeight(value),
                        backgroundColor: liveEqualizerConfig.color,
                      }}
                    />
                    <span
                      className="scene-eq-symmetric-segment scene-eq-symmetric-segment--bottom"
                      style={{
                        height: visualizerSymmetricBarHeight(value),
                        backgroundColor: liveEqualizerConfig.color,
                      }}
                    />
                  </span>
                ))}
              </div>
            ) : (
              <div
                className={`scene-eq-bars scene-eq-bars--${particlePreset} scene-eq-bars--${visualizerType}`}
              >
                {normalizedVisualizerBars.map((value, index) => (
                  <span
                    key={index}
                    className="scene-eq-bar"
                    style={{
                      height: `${Math.max(8, Math.round(value * 100))}%`,
                      backgroundColor: liveEqualizerConfig.color,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="scene-poster-wrap">
            {posterPreviewUrl ? (
              <Image
                className="scene-poster"
                src={posterPreviewUrl}
                alt="Poster preview"
                width={1024}
                height={1024}
                style={{ borderRadius: `${posterCornerRadius}px` }}
                unoptimized
              />
            ) : (
              <div
                className="scene-poster scene-poster-placeholder"
                style={{ borderRadius: `${posterCornerRadius}px` }}
              >
                Poster
              </div>
            )}
          </div>
        </div>
        <p className="layer-note">
          Layer order: blurred poster background, particles, live equalizer,
          center poster.
        </p>

        {previewTimelineEnabled ? (
          <section className="timeline-panel">
            <div className="timeline-head">
              <strong>Timeline v1</strong>
              <div className="timeline-head-actions">
                <button type="button" onClick={() => void togglePlayback()}>
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => seekTo(timeline.trimInMs)}
                  disabled={isPlaying}
                >
                  Jump Trim In
                </button>
              </div>
            </div>

            <div className="timeline-canvas">
              <svg
                viewBox={`0 0 ${timelineWidth} ${timelineHeight}`}
                role="img"
                aria-label="Waveform"
              >
                <rect
                  x="0"
                  y="0"
                  width={timelineWidth}
                  height={timelineHeight}
                  fill="#09101a"
                />
                <path
                  d={waveformPath(waveformValues)}
                  stroke="#6ec8ff"
                  strokeWidth="2"
                  fill="none"
                />
                <rect
                  x="0"
                  y="0"
                  width={trimInX}
                  height={timelineHeight}
                  fill="rgba(0,0,0,0.55)"
                />
                <rect
                  x={trimOutX}
                  y="0"
                  width={Math.max(0, timelineWidth - trimOutX)}
                  height={timelineHeight}
                  fill="rgba(0,0,0,0.55)"
                />
                <line
                  x1={trimInX}
                  y1="0"
                  x2={trimInX}
                  y2={timelineHeight}
                  stroke="#ffc066"
                  strokeWidth="2"
                />
                <line
                  x1={trimOutX}
                  y1="0"
                  x2={trimOutX}
                  y2={timelineHeight}
                  stroke="#ffc066"
                  strokeWidth="2"
                />
                <line
                  x1={playheadX}
                  y1="0"
                  x2={playheadX}
                  y2={timelineHeight}
                  stroke="#ff6d62"
                  strokeWidth="2"
                />
              </svg>
            </div>

            <div className="timeline-sliders">
              <label>
                Playhead ({formatMs(timeline.playheadMs ?? timeline.trimInMs)})
                <input
                  type="range"
                  min={timeline.trimInMs}
                  max={timeline.trimOutMs}
                  step={10}
                  value={timeline.playheadMs ?? timeline.trimInMs}
                  onChange={(event) => seekTo(Number(event.target.value))}
                />
              </label>
              <label>
                Trim in ({formatMs(timeline.trimInMs)})
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, timeline.trimOutMs - 1)}
                  step={10}
                  value={timeline.trimInMs}
                  onChange={(event) => {
                    updateTrim(Number(event.target.value), timeline.trimOutMs);
                  }}
                />
              </label>
              <label>
                Trim out ({formatMs(timeline.trimOutMs)})
                <input
                  type="range"
                  min={Math.min(trackDurationMs, timeline.trimInMs + 1)}
                  max={trackDurationMs}
                  step={10}
                  value={timeline.trimOutMs}
                  onChange={(event) => {
                    updateTrim(timeline.trimInMs, Number(event.target.value));
                  }}
                />
              </label>
            </div>

            <div className="timeline-keyframes">
              <label>
                Keyframe parameter
                <select
                  value={selectedKeyframeParameter}
                  onChange={(event) =>
                    setSelectedKeyframeParameter(
                      event.target.value as TimelineKeyframeParameter,
                    )
                  }
                >
                  <option value="equalizer.width">Equalizer width</option>
                  <option value="equalizer.height">Equalizer height</option>
                  <option value="equalizer.y">Equalizer Y</option>
                </select>
              </label>
              <button type="button" onClick={addKeyframe}>
                Add Keyframe @ Playhead
              </button>
              <button type="button" onClick={clearSelectedKeyframes}>
                Clear Selected Parameter
              </button>
              <ul className="keyframe-list">
                {keyframes.length === 0 ? (
                  <li>No keyframes yet</li>
                ) : (
                  keyframes.map((track) => (
                    <li key={track.parameter}>
                      {track.parameter}: {track.points.length} points
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
        ) : (
          <p className="layer-note">
            Feature flag preview_timeline_v1 is disabled.
          </p>
        )}
      </section>
    </main>
  );
}
