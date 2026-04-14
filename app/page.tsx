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
import { normalizeSpectrumBands } from "@/lib/domain/spectrum";
import {
  createInitialBeatPulseState,
  getNextBeatPulseState,
} from "@/lib/domain/beat-pulse";
import {
  cameraPunchScaleAtMs,
  detectCameraPunchBeatsMs,
} from "@/lib/domain/camera-punch";

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
  const [equalizerGlowStrength, setEqualizerGlowStrength] = useState(0.9);
  const [equalizerGlowColor, setEqualizerGlowColor] = useState("#7fd2ff");
  const [equalizerGlowSpread, setEqualizerGlowSpread] = useState(1);

  const [posterCornerRadius, setPosterCornerRadius] = useState(20);
  const [posterBlurStrength, setPosterBlurStrength] = useState(20);
  const [backgroundDimStrength, setBackgroundDimStrength] = useState(0.48);
  const [posterBeatScaleStrength, setPosterBeatScaleStrength] = useState(1);
  const [beatStrobeSoftStrength, setBeatStrobeSoftStrength] = useState(0);
  const [beatStrobeSoftColor, setBeatStrobeSoftColor] = useState("#ffffff");
  const [cameraPunchStrength, setCameraPunchStrength] = useState(0);
  const [lowEndShakeStrength, setLowEndShakeStrength] = useState(0);
  const [parallaxDriftStrength, setParallaxDriftStrength] = useState(0);
  const [bannerScale, setBannerScale] = useState(0.56);
  const [bannerBorderEnabled, setBannerBorderEnabled] = useState(true);
  const [bannerBorderColor, setBannerBorderColor] = useState("#dceaff");
  const [bannerBorderWidth, setBannerBorderWidth] = useState(2);
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
  const [pendingAutoSaveAfterAnalysis, setPendingAutoSaveAfterAnalysis] =
    useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewDriftMs, setPreviewDriftMs] = useState(0);
  const [previewFps, setPreviewFps] = useState(0);
  const [previewStartupMs, setPreviewStartupMs] = useState(0);
  const [visualizerBars, setVisualizerBars] = useState<number[]>(() =>
    Array.from({ length: 32 }).map(() => 0.05),
  );
  const [posterPulseScale, setPosterPulseScale] = useState(1);
  const [cameraPunchScale, setCameraPunchScale] = useState(1);

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
  const beatPulseStateRef = useRef(createInitialBeatPulseState());

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
    return normalizeSpectrumBands(visualizerBars, visualizerBarCount).map(
      (value) => clampNumber(value, 0.04, 1),
    );
  }, [visualizerBarCount, visualizerBars]);

  const cameraPunchBeatsMs = useMemo(() => {
    return detectCameraPunchBeatsMs({
      spectrumValues,
      frameStepMs: spectrumFrameStepMs,
      barCount: visualizerBarCount,
    });
  }, [spectrumFrameStepMs, spectrumValues, visualizerBarCount]);

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
      const commitBars = (bars: number[]) => {
        const normalizedBars = normalizeSpectrumBands(
          bars,
          visualizerBarCount,
        ).map((value) => clampNumber(value, 0.04, 1));
        setVisualizerBars(normalizedBars);
        const nextPulse = getNextBeatPulseState(
          beatPulseStateRef.current,
          normalizedBars,
          {
            strength: 1,
          },
        );
        beatPulseStateRef.current = nextPulse;
        const pulseStrength = clampNumber(posterBeatScaleStrength, 0, 5);
        const scaledPulse = 1 + (nextPulse.scale - 1) * pulseStrength;
        setPosterPulseScale(clampNumber(scaledPulse, 1, 1.25));

        const playheadMs = Math.round((audio?.currentTime ?? 0) * 1000);
        const punchScale = cameraPunchScaleAtMs({
          absoluteMs: playheadMs,
          beatTimesMs: cameraPunchBeatsMs,
          strength: cameraPunchStrength,
        });
        setCameraPunchScale(clampNumber(punchScale, 1, 1.2));
      };

      const audio = audioRef.current;
      if (audio && spectrumValues.length > 0 && spectrumFrameStepMs > 0) {
        const frameIndex = clampNumber(
          Math.floor((audio.currentTime * 1000) / spectrumFrameStepMs),
          0,
          spectrumValues.length - 1,
        );

        const frame = spectrumValues[frameIndex];
        if (Array.isArray(frame) && frame.length > 0) {
          commitBars(frame);
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
        commitBars(idle);
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

      commitBars(bars);
    },
    [
      cameraPunchBeatsMs,
      cameraPunchStrength,
      posterBeatScaleStrength,
      spectrumFrameStepMs,
      spectrumValues,
      visualizerBarCount,
    ],
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
      setEqualizerGlowStrength(template.equalizerConfig.glowStrength ?? 0.9);
      setEqualizerGlowColor(template.equalizerConfig.glowColor ?? "#7fd2ff");
      setEqualizerGlowSpread(template.equalizerConfig.glowSpread ?? 1);
      setVisualizerBarCount(
        Math.round(template.equalizerConfig.barCount ?? 36),
      );

      setPosterCornerRadius(template.posterConfig.cornerRadius);
      setPosterBlurStrength(template.posterConfig.blurStrength);
      setBackgroundDimStrength(template.posterConfig.backgroundDimStrength);
      setPosterBeatScaleStrength(template.posterConfig.beatScaleStrength ?? 1);
      setBeatStrobeSoftStrength(
        template.posterConfig.beatStrobeSoftStrength ?? 0,
      );
      setBeatStrobeSoftColor(
        template.posterConfig.beatStrobeSoftColor ?? "#ffffff",
      );
      setCameraPunchStrength(template.posterConfig.cameraPunchStrength ?? 0);
      setLowEndShakeStrength(template.posterConfig.lowEndShakeStrength ?? 0);
      setParallaxDriftStrength(
        template.posterConfig.parallaxDriftStrength ?? 0,
      );
      setBannerScale(template.posterConfig.bannerScale ?? 0.56);
      setBannerBorderEnabled(template.posterConfig.bannerBorderEnabled ?? true);
      setBannerBorderColor(
        template.posterConfig.bannerBorderColor ?? "#dceaff",
      );
      setBannerBorderWidth(template.posterConfig.bannerBorderWidth ?? 2);

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
    beatPulseStateRef.current = createInitialBeatPulseState();
    setPosterPulseScale(1);
    setCameraPunchScale(1);
  }, [visualizerBarCount]);

  useEffect(() => {
    beatPulseStateRef.current = createInitialBeatPulseState();
    setPosterPulseScale(1);
  }, [posterBeatScaleStrength]);

  useEffect(() => {
    setCameraPunchScale(1);
  }, [cameraPunchStrength]);

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
            setEqualizerGlowStrength(first.equalizerConfig.glowStrength ?? 0.9);
            setEqualizerGlowColor(first.equalizerConfig.glowColor ?? "#7fd2ff");
            setEqualizerGlowSpread(first.equalizerConfig.glowSpread ?? 1);
            setVisualizerBarCount(
              Math.round(first.equalizerConfig.barCount ?? 36),
            );
            setPosterCornerRadius(first.posterConfig.cornerRadius);
            setPosterBlurStrength(first.posterConfig.blurStrength);
            setBackgroundDimStrength(first.posterConfig.backgroundDimStrength);
            setPosterBeatScaleStrength(
              first.posterConfig.beatScaleStrength ?? 1,
            );
            setBeatStrobeSoftStrength(
              first.posterConfig.beatStrobeSoftStrength ?? 0,
            );
            setBeatStrobeSoftColor(
              first.posterConfig.beatStrobeSoftColor ?? "#ffffff",
            );
            setCameraPunchStrength(first.posterConfig.cameraPunchStrength ?? 0);
            setLowEndShakeStrength(first.posterConfig.lowEndShakeStrength ?? 0);
            setParallaxDriftStrength(
              first.posterConfig.parallaxDriftStrength ?? 0,
            );
            setBannerScale(first.posterConfig.bannerScale ?? 0.56);
            setBannerBorderEnabled(
              first.posterConfig.bannerBorderEnabled ?? true,
            );
            setBannerBorderColor(
              first.posterConfig.bannerBorderColor ?? "#dceaff",
            );
            setBannerBorderWidth(first.posterConfig.bannerBorderWidth ?? 2);
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
        .then(async (data) => {
          setAnalysisStatus(data.status);
          if (data.status === "done") {
            setStatus("Audio analysis complete");
            if (pendingAutoSaveAfterAnalysis) {
              setPendingAutoSaveAfterAnalysis(false);
              try {
                await tryAutoSaveProject();
              } catch {
                setStatus("Analysis done, auto-save failed");
              }
            }
          }
        })
        .catch(() => {
          setAnalysisStatus("failed");
          setStatus("Audio analysis failed");
        });
    }, 1500);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, analysisStatus, pendingAutoSaveAfterAnalysis]);

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
    const upload = await uploadTrackAsset(file);
    setTrackAssetId(upload.assetId);

    const analysis = await startTrackAnalysis(upload.assetId);
    setAnalysisId(analysis.analysisId);
    setAnalysisStatus(analysis.status);
    setPendingAutoSaveAfterAnalysis(true);
    setStatus("Track uploaded, analysis started");
  }

  async function uploadPoster(file: File) {
    const data = await uploadPosterAsset(file);
    setPosterAssetId(data.assetId);
  }

  async function uploadBackground(file: File) {
    const data = await uploadPosterAsset(file);
    setBackgroundAssetId(data.assetId);
  }

  async function prepareRenderBackgroundAsset() {
    const sourceAssetId = backgroundAssetId || posterAssetId;
    if (!sourceAssetId) {
      return null;
    }

    const response = await fetch(`/api/assets/${sourceAssetId}`);
    if (!response.ok) {
      throw new Error("Background asset fetch failed");
    }

    const sourceBlob = await response.blob();
    const bitmap = await createImageBitmap(sourceBlob);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = renderResolution.width;
      canvas.height = renderResolution.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas context unavailable");
      }

      const coverScale = Math.max(
        canvas.width / bitmap.width,
        canvas.height / bitmap.height,
      );
      const baseW = bitmap.width * coverScale;
      const baseH = bitmap.height * coverScale;

      const sceneZoom = 1.18;
      const drawW = baseW * sceneZoom;
      const drawH = baseH * sceneZoom;
      const x = (canvas.width - drawW) / 2;
      const y = (canvas.height - drawH) / 2;

      ctx.save();
      ctx.filter = `blur(${Math.max(8, posterBlurStrength)}px) saturate(1.05)`;
      ctx.drawImage(bitmap, x, y, drawW, drawH);
      ctx.restore();

      const dimOpacity = clampNumber(backgroundDimStrength, 0, 0.85);
      if (dimOpacity > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${dimOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const renderedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });

      if (!renderedBlob) {
        throw new Error("Prepared background export failed");
      }

      const file = new File(
        [renderedBlob],
        `prepared-background-${Date.now()}.png`,
        { type: "image/png" },
      );

      const uploaded = await uploadPosterAsset(file);
      return uploaded.assetId;
    } finally {
      bitmap.close();
    }
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

  const buildCreateProjectPayload =
    useCallback((): CreateProjectPayload | null => {
      if (
        !trackAssetId ||
        !posterAssetId ||
        analysisStatus !== "done" ||
        !analysisId
      ) {
        return null;
      }

      return {
        clientToken,
        name: projectName,
        format,
        quality,
        fps: 30,
        trackAssetId,
        posterAssetId,
        backgroundAssetId: backgroundAssetId || null,
        renderBackgroundAssetId: null,
        analysisId,
        templateId: selectedTemplateId,
        equalizerConfig: {
          x: 0.5,
          y: equalizerY,
          width: equalizerWidth,
          height: equalizerHeight,
          color: equalizerColor,
          glowStrength: equalizerGlowStrength,
          glowColor: equalizerGlowColor,
          glowSpread: equalizerGlowSpread,
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
          backgroundDimStrength,
          beatScaleStrength: posterBeatScaleStrength,
          beatStrobeSoftStrength,
          beatStrobeSoftColor,
          cameraPunchStrength,
          lowEndShakeStrength,
          parallaxDriftStrength,
          bannerScale,
          bannerBorderEnabled,
          bannerBorderColor,
          bannerBorderWidth,
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
    }, [
      analysisId,
      analysisStatus,
      artistName,
      backgroundAssetId,
      backgroundDimStrength,
      bannerBorderColor,
      bannerBorderEnabled,
      bannerBorderWidth,
      bannerScale,
      beatStrobeSoftColor,
      beatStrobeSoftStrength,
      cameraPunchStrength,
      clientToken,
      equalizerColor,
      equalizerGlowColor,
      equalizerGlowSpread,
      equalizerGlowStrength,
      equalizerHeight,
      equalizerWidth,
      equalizerY,
      format,
      keyframes,
      posterAssetId,
      posterBeatScaleStrength,
      posterBlurStrength,
      posterCornerRadius,
      lowEndShakeStrength,
      parallaxDriftStrength,
      projectName,
      quality,
      selectedTemplateId,
      songName,
      timeline,
      trackAssetId,
      trackTextAlign,
      trackTextColor,
      trackTextGap,
      trackTextSize,
      trackTextX,
      trackTextY,
      visualizerBarCount,
      visualizerType,
    ]);

  async function saveProject(event: FormEvent) {
    event.preventDefault();

    const payload = buildCreateProjectPayload();
    if (!payload) {
      setStatus("Upload files and complete analysis before saving");
      return;
    }

    const data = await createProject(payload);
    setProjectId(data.projectId);
    setStatus("Project saved");
  }

  async function tryAutoSaveProject() {
    const payload = buildCreateProjectPayload();
    if (!payload) {
      setStatus("Analysis done. Upload poster to auto-save project");
      return;
    }

    const data = await createProject(payload);
    setProjectId(data.projectId);
    setStatus("Analysis complete, project auto-saved");
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
    setEqualizerGlowStrength(data.equalizerConfig.glowStrength ?? 0.9);
    setEqualizerGlowColor(data.equalizerConfig.glowColor ?? "#7fd2ff");
    setEqualizerGlowSpread(data.equalizerConfig.glowSpread ?? 1);
    setVisualizerType(data.equalizerConfig.visualizerType ?? "bars");
    setVisualizerBarCount(Math.round(data.equalizerConfig.barCount ?? 36));
    setPosterCornerRadius(data.posterConfig?.cornerRadius ?? 20);
    setPosterBlurStrength(data.posterConfig?.blurStrength ?? 20);
    setBackgroundDimStrength(data.posterConfig?.backgroundDimStrength ?? 0.48);
    setPosterBeatScaleStrength(data.posterConfig?.beatScaleStrength ?? 1);
    setBeatStrobeSoftStrength(data.posterConfig?.beatStrobeSoftStrength ?? 0);
    setBeatStrobeSoftColor(data.posterConfig?.beatStrobeSoftColor ?? "#ffffff");
    setCameraPunchStrength(data.posterConfig?.cameraPunchStrength ?? 0);
    setLowEndShakeStrength(data.posterConfig?.lowEndShakeStrength ?? 0);
    setParallaxDriftStrength(data.posterConfig?.parallaxDriftStrength ?? 0);
    setBannerScale(data.posterConfig?.bannerScale ?? 0.56);
    setBannerBorderEnabled(data.posterConfig?.bannerBorderEnabled ?? true);
    setBannerBorderColor(data.posterConfig?.bannerBorderColor ?? "#dceaff");
    setBannerBorderWidth(data.posterConfig?.bannerBorderWidth ?? 2);
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
    } catch (error) {
      if (error instanceof Error && error.message.trim().length > 0) {
        setStatus(error.message.slice(0, 220));
      } else {
        setStatus("Operation failed. Check input and try again.");
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function startRender() {
    if (!projectId.trim()) {
      setStatus("Save or load a project first");
      return;
    }

    setStatus("Preparing background for render...");
    const preparedRenderBackgroundAssetId =
      await prepareRenderBackgroundAsset();
    setStatus("Syncing project settings...");

    await patchProject(projectId.trim(), {
      clientToken,
      templateId: selectedTemplateId,
      backgroundAssetId: backgroundAssetId || null,
      renderBackgroundAssetId: preparedRenderBackgroundAssetId,
      equalizerConfig: {
        x: 0.5,
        y: equalizerY,
        width: equalizerWidth,
        height: equalizerHeight,
        color: equalizerColor,
        glowStrength: equalizerGlowStrength,
        glowColor: equalizerGlowColor,
        glowSpread: equalizerGlowSpread,
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
        backgroundDimStrength,
        beatScaleStrength: posterBeatScaleStrength,
        beatStrobeSoftStrength,
        beatStrobeSoftColor,
        cameraPunchStrength,
        lowEndShakeStrength,
        parallaxDriftStrength,
        bannerScale,
        bannerBorderEnabled,
        bannerBorderColor,
        bannerBorderWidth,
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
      beatPulseStateRef.current = createInitialBeatPulseState();
      setPosterPulseScale(1);
      setCameraPunchScale(1);
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
    <main className={`editor-root editor-root--${format}`}>
      <audio
        ref={audioRef}
        src={trackPlaybackUrl || undefined}
        preload="auto"
      />

      <div className="editor-workspace">
        <div className="editor-main-column">
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
            equalizerGlowStrength={equalizerGlowStrength}
            equalizerGlowColor={equalizerGlowColor}
            equalizerGlowSpread={equalizerGlowSpread}
            visualizerType={visualizerType}
            visualizerBarCount={visualizerBarCount}
            posterBlurStrength={posterBlurStrength}
            backgroundDimStrength={backgroundDimStrength}
            posterCornerRadius={posterCornerRadius}
            posterBeatScaleStrength={posterBeatScaleStrength}
            beatStrobeSoftStrength={beatStrobeSoftStrength}
            beatStrobeSoftColor={beatStrobeSoftColor}
            cameraPunchStrength={cameraPunchStrength}
            lowEndShakeStrength={lowEndShakeStrength}
            parallaxDriftStrength={parallaxDriftStrength}
            bannerScale={bannerScale}
            bannerBorderEnabled={bannerBorderEnabled}
            bannerBorderColor={bannerBorderColor}
            bannerBorderWidth={bannerBorderWidth}
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
            onEqualizerGlowStrengthChange={setEqualizerGlowStrength}
            onEqualizerGlowColorChange={setEqualizerGlowColor}
            onEqualizerGlowSpreadChange={setEqualizerGlowSpread}
            onVisualizerTypeChange={setVisualizerType}
            onVisualizerBarCountChange={setVisualizerBarCount}
            onPosterBlurStrengthChange={setPosterBlurStrength}
            onBackgroundDimStrengthChange={setBackgroundDimStrength}
            onPosterCornerRadiusChange={setPosterCornerRadius}
            onPosterBeatScaleStrengthChange={setPosterBeatScaleStrength}
            onBeatStrobeSoftStrengthChange={setBeatStrobeSoftStrength}
            onBeatStrobeSoftColorChange={setBeatStrobeSoftColor}
            onCameraPunchStrengthChange={setCameraPunchStrength}
            onLowEndShakeStrengthChange={setLowEndShakeStrength}
            onParallaxDriftStrengthChange={setParallaxDriftStrength}
            onBannerScaleChange={setBannerScale}
            onBannerBorderEnabledChange={setBannerBorderEnabled}
            onBannerBorderColorChange={setBannerBorderColor}
            onBannerBorderWidthChange={setBannerBorderWidth}
            onArtistNameChange={setArtistName}
            onSongNameChange={setSongName}
            onTrackTextColorChange={setTrackTextColor}
            onTrackTextXChange={setTrackTextX}
            onTrackTextYChange={setTrackTextY}
            onTrackTextSizeChange={setTrackTextSize}
            onTrackTextGapChange={setTrackTextGap}
            onTrackTextAlignChange={setTrackTextAlign}
            onSubmitProject={(event) =>
              void runAction(() => saveProject(event))
            }
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

          <PreviewTimelinePanel
            previewTimelineEnabled={previewTimelineEnabled}
            isPlaying={isPlaying}
            onTogglePlayback={() => void togglePlayback()}
            onSeekTo={seekTo}
            onCutToSelection={updateTrim}
            timeline={timeline}
            trackDurationMs={trackDurationMs}
            trimInX={trimInX}
            trimOutX={trimOutX}
            playheadX={playheadX}
            waveformValues={waveformValues}
            onUpdateTrim={updateTrim}
          />
        </div>

        <div className="editor-preview-column">
          <PreviewPanel
            previewAspectRatio={previewAspectRatio}
            sceneAccentA={
              selectedTemplate?.defaultPalette?.[0] ?? equalizerColor
            }
            sceneAccentB={selectedTemplate?.defaultPalette?.[1] ?? "#11141f"}
            sceneAccentC={selectedTemplate?.defaultPalette?.[2] ?? "#d8e8ff"}
            posterAssetId={posterAssetId}
            backgroundAssetId={backgroundAssetId}
            posterBlurStrength={posterBlurStrength}
            backgroundDimStrength={backgroundDimStrength}
            liveEqualizerConfig={liveEqualizerConfig}
            equalizerGlowStrength={equalizerGlowStrength}
            equalizerGlowColor={equalizerGlowColor}
            equalizerGlowSpread={equalizerGlowSpread}
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
            bannerScale={bannerScale}
            bannerBorderEnabled={bannerBorderEnabled}
            bannerBorderColor={bannerBorderColor}
            bannerBorderWidth={bannerBorderWidth}
            artistName={artistName}
            songName={songName}
            trackTextColor={trackTextColor}
            trackTextX={trackTextX}
            trackTextY={trackTextY}
            trackTextSize={trackTextSize}
            trackTextGap={trackTextGap}
            trackTextAlign={trackTextAlign}
            posterPulseScale={posterPulseScale}
            cameraPunchScale={cameraPunchScale}
            beatStrobeSoftStrength={beatStrobeSoftStrength}
            beatStrobeSoftColor={beatStrobeSoftColor}
            lowEndShakeStrength={lowEndShakeStrength}
            parallaxDriftStrength={parallaxDriftStrength}
            previewTimeMs={timeline.playheadMs ?? timeline.trimInMs}
            renderWidth={renderResolution.width}
            renderHeight={renderResolution.height}
          />
        </div>
      </div>
    </main>
  );
}
