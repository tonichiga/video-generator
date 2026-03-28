"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  cancelRenderJob,
  createProject,
  getAnalysisStatus,
  getFeatureFlags,
  getProject,
  getRenderStatus,
  getSpectrum,
  getTemplates,
  getWaveform,
  patchProject,
  postPreviewMetric,
  retryRenderJob,
  startRenderJob,
  startTrackAnalysis,
  uploadPosterAsset,
  uploadTrackAsset,
} from "@/app/editor/api";
import {
  createDefaultClientToken,
  DEFAULT_DURATION_MS,
  TIMELINE_WIDTH,
} from "@/app/editor/constants";
import { EditorPanel } from "@/app/editor/components/EditorPanel";
import { PreviewPanel } from "./editor/components/PreviewPanel";
import { PreviewTimelinePanel } from "./editor/components/PreviewPanel";
import type {
  CreateProjectPayload,
  TimelineKeyframeParameter,
  TimelineKeyframeTrack,
  TimelineState,
  TemplateItem,
  Format,
  Quality,
  VisualizerType,
} from "@/app/editor/types";
import { normalizeTimeline, visualizerLinePath } from "@/app/editor/utils";
import {
  applyKeyframesToEqualizer,
  clampNumber,
  getDefaultTimeline,
} from "@/lib/domain/timeline";

export default function Home() {
  const [clientToken, setClientToken] = useState("");
  const [projectName, setProjectName] = useState("My Mix #1");
  const [format, setFormat] = useState<Format>("tiktok");
  const [quality, setQuality] = useState<Quality>("fhd");

  const [trackAssetId, setTrackAssetId] = useState("");
  const [posterAssetId, setPosterAssetId] = useState("");
  const [backgroundAssetId, setBackgroundAssetId] = useState("");
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
  const [visualizerBarCount, setVisualizerBarCount] = useState(36);

  const [posterCornerRadius, setPosterCornerRadius] = useState(20);
  const [posterBlurStrength, setPosterBlurStrength] = useState(20);
  const [artistName, setArtistName] = useState("Unknown Artist");
  const [songName, setSongName] = useState("Untitled Track");
  const [trackTextColor, setTrackTextColor] = useState("#FFFFFF");
  const [trackTextX, setTrackTextX] = useState(0.5);
  const [trackTextY, setTrackTextY] = useState(0.82);
  const [trackTextSize, setTrackTextSize] = useState(34);
  const [trackTextGap, setTrackTextGap] = useState(10);
  const [trackTextAlign, setTrackTextAlign] = useState<
    "left" | "center" | "right"
  >("center");

  const [status, setStatus] = useState("Ready");
  const [isBusy, setIsBusy] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const [previewTimelineEnabled, setPreviewTimelineEnabled] = useState(false);
  const [trackDurationMs, setTrackDurationMs] = useState(DEFAULT_DURATION_MS);
  const [waveformValues, setWaveformValues] = useState<number[]>([]);
  const [spectrumFrameStepMs, setSpectrumFrameStepMs] = useState(33);
  const [spectrumValues, setSpectrumValues] = useState<number[][]>([]);
  const [timeline, setTimeline] = useState<TimelineState>(() =>
    getDefaultTimeline(DEFAULT_DURATION_MS),
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

  useEffect(() => {
    setIsHydrated(true);
    setClientToken((prev) => prev || createDefaultClientToken());
  }, []);

  const previewAspectRatio = useMemo(() => {
    return format === "tiktok" ? "9 / 16" : "16 / 9";
  }, [format]);

  const renderResolution = useMemo(() => {
    if (format === "tiktok") {
      return quality === "hd"
        ? { width: 720, height: 1280 }
        : { width: 1080, height: 1920 };
    }

    return quality === "hd"
      ? { width: 1280, height: 720 }
      : { width: 1920, height: 1080 };
  }, [format, quality]);

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
    () => (timeline.trimInMs / trackDurationMs) * TIMELINE_WIDTH,
    [timeline.trimInMs, trackDurationMs],
  );
  const trimOutX = useMemo(
    () => (timeline.trimOutMs / trackDurationMs) * TIMELINE_WIDTH,
    [timeline.trimOutMs, trackDurationMs],
  );
  const playheadX = useMemo(() => {
    const value = timeline.playheadMs ?? timeline.trimInMs;
    return (value / trackDurationMs) * TIMELINE_WIDTH;
  }, [timeline.playheadMs, timeline.trimInMs, trackDurationMs]);

  const trackPlaybackUrl = useMemo(() => {
    if (trackAssetId) {
      return `/api/assets/${trackAssetId}`;
    }

    return "";
  }, [trackAssetId]);

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
      void postPreviewMetric(body);
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
      setVisualizerBarCount(
        Math.round(template.equalizerConfig.barCount ?? 36),
      );

      setPosterCornerRadius(template.posterConfig.cornerRadius);
      setPosterBlurStrength(template.posterConfig.blurStrength);

      if (emitEvent) {
        emitPreviewMetric("template_change", {
          templateId,
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

    void getTemplates()
      .then((data) => {
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
            setVisualizerBarCount(
              Math.round(first.equalizerConfig.barCount ?? 36),
            );
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

    void getFeatureFlags()
      .then((data) => {
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
    if (
      !analysisId ||
      analysisStatus === "done" ||
      analysisStatus === "failed"
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void getAnalysisStatus(analysisId)
        .then((data) => {
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

    void getWaveform(analysisId)
      .then((data) => {
        if (canceled) {
          return;
        }

        setWaveformValues(data.values);
        const nextDurationMs = Math.max(
          100,
          data.durationMs || DEFAULT_DURATION_MS,
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

    void getSpectrum(analysisId, visualizerBarCount)
      .then((data) => {
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
      void getRenderStatus(renderJobId)
        .then((data) => {
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

  async function uploadTrack(file: File) {
    const data = await uploadTrackAsset(file);
    setTrackAssetId(data.assetId);
  }

  async function uploadPoster(file: File) {
    const data = await uploadPosterAsset(file);
    setPosterAssetId(data.assetId);
  }

  async function uploadBackground(file: File) {
    const data = await uploadPosterAsset(file);
    setBackgroundAssetId(data.assetId);
  }

  async function analyzeTrack() {
    if (!trackAssetId) {
      setStatus("Upload track first");
      return;
    }

    const data = await startTrackAnalysis(trackAssetId);
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

    const payload: CreateProjectPayload = {
      clientToken,
      name: projectName,
      format,
      quality,
      fps: 30,
      trackAssetId,
      posterAssetId,
      backgroundAssetId: backgroundAssetId || null,
      analysisId,
      templateId: selectedTemplateId,
      equalizerConfig: {
        x: 0.5,
        y: equalizerY,
        width: equalizerWidth,
        height: equalizerHeight,
        color: equalizerColor,
        visualizerType,
        barCount: visualizerBarCount,
      },
      particleConfig: {
        preset: "off",
        density: 0,
        speed: 0.5,
      },
      posterConfig: {
        cornerRadius: posterCornerRadius,
        blurStrength: posterBlurStrength,
      },
      trackTextConfig: {
        artist: artistName.trim() || "Unknown Artist",
        songName: songName.trim() || "Untitled Track",
        color: trackTextColor,
        x: trackTextX,
        y: trackTextY,
        size: trackTextSize,
        gap: trackTextGap,
        align: trackTextAlign,
      },
      timeline: {
        ...timeline,
        playheadMs: timeline.playheadMs ?? timeline.trimInMs,
      },
      keyframes,
    };

    const data = await createProject(payload);
    setProjectId(data.projectId);
    setStatus("Project saved");
  }

  async function loadProject() {
    if (!projectId.trim()) {
      setStatus("Enter project ID first");
      return;
    }

    const data = await getProject(projectId.trim(), clientToken);

    setProjectName(data.name);
    setFormat(data.format);
    setQuality(data.quality);
    setTrackAssetId(data.trackAssetId);
    setPosterAssetId(data.posterAssetId);
    setBackgroundAssetId(data.backgroundAssetId ?? "");
    setAnalysisId(data.analysisId);
    setAnalysisStatus("done");
    setSelectedTemplateId(data.templateId);
    setEqualizerColor(data.equalizerConfig.color);
    setEqualizerWidth(data.equalizerConfig.width);
    setEqualizerHeight(data.equalizerConfig.height);
    setEqualizerY(data.equalizerConfig.y);
    setVisualizerType(data.equalizerConfig.visualizerType ?? "bars");
    setVisualizerBarCount(Math.round(data.equalizerConfig.barCount ?? 36));
    setPosterCornerRadius(data.posterConfig?.cornerRadius ?? 20);
    setPosterBlurStrength(data.posterConfig?.blurStrength ?? 20);
    setArtistName(data.trackTextConfig?.artist ?? "Unknown Artist");
    setSongName(data.trackTextConfig?.songName ?? "Untitled Track");
    setTrackTextColor(data.trackTextConfig?.color ?? "#FFFFFF");
    setTrackTextX(data.trackTextConfig?.x ?? 0.5);
    setTrackTextY(data.trackTextConfig?.y ?? 0.82);
    setTrackTextSize(data.trackTextConfig?.size ?? 34);
    setTrackTextGap(data.trackTextConfig?.gap ?? 10);
    setTrackTextAlign(data.trackTextConfig?.align ?? "center");
    setTimeline(normalizeTimeline(data.timeline, trackDurationMs));
    setKeyframes(Array.isArray(data.keyframes) ? data.keyframes : []);
    setStatus("Project loaded");
  }

  async function saveTimelineState() {
    if (!projectId.trim()) {
      setStatus("Save or load a project before timeline persistence");
      return;
    }

    await patchProject(projectId.trim(), {
      clientToken,
      timeline: {
        ...timeline,
        playheadMs: timeline.playheadMs ?? timeline.trimInMs,
      },
      keyframes,
    });

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

    await patchProject(projectId.trim(), {
      clientToken,
      templateId: selectedTemplateId,
      backgroundAssetId: backgroundAssetId || null,
      equalizerConfig: {
        x: 0.5,
        y: equalizerY,
        width: equalizerWidth,
        height: equalizerHeight,
        color: equalizerColor,
        visualizerType,
        barCount: visualizerBarCount,
      },
      particleConfig: {
        preset: "off",
        density: 0,
        speed: 0.5,
      },
      posterConfig: {
        cornerRadius: posterCornerRadius,
        blurStrength: posterBlurStrength,
      },
      trackTextConfig: {
        artist: artistName.trim() || "Unknown Artist",
        songName: songName.trim() || "Untitled Track",
        color: trackTextColor,
        x: trackTextX,
        y: trackTextY,
        size: trackTextSize,
        gap: trackTextGap,
        align: trackTextAlign,
      },
      timeline: {
        ...timeline,
        playheadMs: timeline.playheadMs ?? timeline.trimInMs,
      },
      keyframes,
    });

    const data = await startRenderJob(projectId.trim(), clientToken);

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

    await cancelRenderJob(renderJobId, clientToken);

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

    const data = await retryRenderJob(renderJobId, clientToken);

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

  const equalizerLineD = useMemo(
    () => visualizerLinePath(normalizedVisualizerBars),
    [normalizedVisualizerBars],
  );

  if (!isHydrated) {
    return (
      <main className="editor-root">
        <audio ref={audioRef} preload="auto" />
      </main>
    );
  }

  return (
    <main className="editor-root ">
      <audio
        ref={audioRef}
        src={trackPlaybackUrl || undefined}
        preload="auto"
      />

      <div className="grid grid-cols-2 w-full justify-between">
        <EditorPanel
          clientToken={clientToken}
          projectName={projectName}
          format={format}
          quality={quality}
          selectedTemplateId={selectedTemplateId}
          templates={templates}
          equalizerColor={equalizerColor}
          equalizerWidth={equalizerWidth}
          equalizerHeight={equalizerHeight}
          equalizerY={equalizerY}
          visualizerType={visualizerType}
          visualizerBarCount={visualizerBarCount}
          posterBlurStrength={posterBlurStrength}
          posterCornerRadius={posterCornerRadius}
          artistName={artistName}
          songName={songName}
          trackTextColor={trackTextColor}
          trackTextX={trackTextX}
          trackTextY={trackTextY}
          trackTextSize={trackTextSize}
          trackTextGap={trackTextGap}
          trackTextAlign={trackTextAlign}
          projectId={projectId}
          status={status}
          isBusy={isBusy}
          trackAssetId={trackAssetId}
          posterAssetId={posterAssetId}
          backgroundAssetId={backgroundAssetId}
          analysisId={analysisId}
          analysisStatus={analysisStatus}
          renderJobId={renderJobId}
          renderStatus={renderStatus}
          renderProgress={renderProgress}
          previewTimelineEnabled={previewTimelineEnabled}
          previewStartupMs={previewStartupMs}
          previewDriftMs={previewDriftMs}
          previewFps={previewFps}
          onClientTokenChange={setClientToken}
          onProjectNameChange={setProjectName}
          onFormatChange={setFormat}
          onQualityChange={setQuality}
          onTemplateChange={(value) => applyTemplateSettings(value, true)}
          onEqualizerColorChange={setEqualizerColor}
          onEqualizerWidthChange={setEqualizerWidth}
          onEqualizerHeightChange={setEqualizerHeight}
          onEqualizerYChange={setEqualizerY}
          onVisualizerTypeChange={setVisualizerType}
          onVisualizerBarCountChange={setVisualizerBarCount}
          onPosterBlurStrengthChange={setPosterBlurStrength}
          onPosterCornerRadiusChange={setPosterCornerRadius}
          onArtistNameChange={setArtistName}
          onSongNameChange={setSongName}
          onTrackTextColorChange={setTrackTextColor}
          onTrackTextXChange={setTrackTextX}
          onTrackTextYChange={setTrackTextY}
          onTrackTextSizeChange={setTrackTextSize}
          onTrackTextGapChange={setTrackTextGap}
          onTrackTextAlignChange={setTrackTextAlign}
          onSubmitProject={(event) => void runAction(() => saveProject(event))}
          onUploadTrack={(file) => void runAction(() => uploadTrack(file))}
          onAnalyzeTrack={() => void runAction(analyzeTrack)}
          onStartRender={() => void runAction(startRender)}
          onDownloadRender={downloadRender}
          onCancelRender={() => void runAction(cancelRender)}
          onRetryRender={() => void runAction(retryRender)}
          onProjectIdChange={setProjectId}
          onLoadProject={() => void runAction(loadProject)}
          onSaveTimeline={() => void runAction(saveTimelineState)}
        />

        <PreviewPanel
          previewAspectRatio={previewAspectRatio}
          sceneAccentA={selectedTemplate?.defaultPalette?.[0] ?? equalizerColor}
          sceneAccentB={selectedTemplate?.defaultPalette?.[1] ?? "#11141f"}
          sceneAccentC={selectedTemplate?.defaultPalette?.[2] ?? "#d8e8ff"}
          posterAssetId={posterAssetId}
          backgroundAssetId={backgroundAssetId}
          posterBlurStrength={posterBlurStrength}
          liveEqualizerConfig={liveEqualizerConfig}
          onPosterFileSelected={(file) =>
            void runAction(() => uploadPoster(file))
          }
          onBackgroundFileSelected={(file) =>
            void runAction(() => uploadBackground(file))
          }
          visualizerType={visualizerType}
          normalizedVisualizerBars={normalizedVisualizerBars}
          equalizerLineD={equalizerLineD}
          posterCornerRadius={posterCornerRadius}
          artistName={artistName}
          songName={songName}
          trackTextColor={trackTextColor}
          trackTextX={trackTextX}
          trackTextY={trackTextY}
          trackTextSize={trackTextSize}
          trackTextGap={trackTextGap}
          trackTextAlign={trackTextAlign}
          renderHeight={renderResolution.height}
        />
      </div>

      <PreviewTimelinePanel
        previewTimelineEnabled={previewTimelineEnabled}
        isPlaying={isPlaying}
        onTogglePlayback={() => void togglePlayback()}
        onSeekTo={seekTo}
        timeline={timeline}
        trackDurationMs={trackDurationMs}
        trimInX={trimInX}
        trimOutX={trimOutX}
        playheadX={playheadX}
        waveformValues={waveformValues}
        onUpdateTrim={updateTrim}
        selectedKeyframeParameter={selectedKeyframeParameter}
        onSelectedKeyframeParameterChange={setSelectedKeyframeParameter}
        onAddKeyframe={addKeyframe}
        onClearSelectedKeyframes={clearSelectedKeyframes}
        keyframes={keyframes}
      />
    </main>
  );
}
