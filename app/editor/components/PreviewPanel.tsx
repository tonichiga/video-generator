import {
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { getParallaxBackgroundDriftAtMs } from "@/lib/domain/parallax-drift";

import { TIMELINE_HEIGHT, TIMELINE_WIDTH } from "@/app/editor/constants";
import type { TimelineState, VisualizerType } from "@/app/editor/types";
import {
  formatMs,
  visualizerSymmetricBarHeight,
  waveformPath,
} from "@/app/editor/utils";

type PreviewPanelProps = {
  previewAspectRatio: string;
  sceneAccentA: string;
  sceneAccentB: string;
  sceneAccentC: string;
  posterAssetId: string;
  backgroundAssetId: string;
  posterBlurStrength: number;
  backgroundDimStrength: number;
  liveEqualizerConfig: {
    width: number;
    height: number;
    y: number;
    color: string;
  };
  onPosterFileSelected: (file: File) => void;
  onBackgroundFileSelected: (file: File) => void;
  visualizerType: VisualizerType;
  normalizedVisualizerBars: number[];
  equalizerLineD: string;
  posterCornerRadius: number;
  bannerScale: number;
  bannerBorderEnabled: boolean;
  bannerBorderColor: string;
  bannerBorderWidth: number;
  artistName: string;
  songName: string;
  trackTextColor: string;
  trackTextX: number;
  trackTextY: number;
  trackTextSize: number;
  trackTextGap: number;
  trackTextAlign: "left" | "center" | "right";
  posterPulseScale: number;
  cameraPunchScale: number;
  parallaxDriftStrength: number;
  previewTimeMs: number;
  renderWidth: number;
  renderHeight: number;
};

type PreviewTimelinePanelProps = {
  previewTimelineEnabled: boolean;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onSeekTo: (value: number) => void;
  onCutToSelection: (trimInMs: number, trimOutMs: number) => void;
  timeline: TimelineState;
  trackDurationMs: number;
  trimInX: number;
  trimOutX: number;
  playheadX: number;
  waveformValues: number[];
  onUpdateTrim: (trimInMs: number, trimOutMs: number) => void;
};

export function PreviewPanel({
  previewAspectRatio,
  sceneAccentA,
  sceneAccentB,
  sceneAccentC,
  posterAssetId,
  backgroundAssetId,
  posterBlurStrength,
  backgroundDimStrength,
  liveEqualizerConfig,
  onPosterFileSelected,
  onBackgroundFileSelected,
  visualizerType,
  normalizedVisualizerBars,
  equalizerLineD,
  posterCornerRadius,
  bannerScale,
  bannerBorderEnabled,
  bannerBorderColor,
  bannerBorderWidth,
  artistName,
  songName,
  trackTextColor,
  trackTextX,
  trackTextY,
  trackTextSize,
  trackTextGap,
  trackTextAlign,
  posterPulseScale,
  cameraPunchScale,
  parallaxDriftStrength,
  previewTimeMs,
  renderWidth,
  renderHeight,
}: PreviewPanelProps) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const drawBackgroundRef = useRef<() => void>(() => {});
  const backgroundLoadIdRef = useRef(0);
  const backgroundFileInputRef = useRef<HTMLInputElement | null>(null);
  const posterFileInputRef = useRef<HTMLInputElement | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<
    string | null
  >(null);
  const [sceneHeightPx, setSceneHeightPx] = useState(0);

  useEffect(() => {
    if (!sceneRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSceneHeightPx(Math.max(1, Math.round(entry.contentRect.height)));
      }
    });

    observer.observe(sceneRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (posterPreviewUrl) {
        URL.revokeObjectURL(posterPreviewUrl);
      }
      if (backgroundPreviewUrl) {
        URL.revokeObjectURL(backgroundPreviewUrl);
      }
    };
  }, [backgroundPreviewUrl, posterPreviewUrl]);

  const sceneBackgroundUrl = useMemo(() => {
    if (backgroundPreviewUrl) {
      return backgroundPreviewUrl;
    }
    if (backgroundAssetId) {
      return `/api/assets/${backgroundAssetId}`;
    }
    if (posterPreviewUrl) {
      return posterPreviewUrl;
    }
    if (posterAssetId) {
      return `/api/assets/${posterAssetId}`;
    }

    return "";
  }, [
    backgroundAssetId,
    backgroundPreviewUrl,
    posterAssetId,
    posterPreviewUrl,
  ]);

  const scenePosterUrl = useMemo(() => {
    if (posterPreviewUrl) {
      return posterPreviewUrl;
    }

    if (posterAssetId) {
      return `/api/assets/${posterAssetId}`;
    }

    return "";
  }, [posterAssetId, posterPreviewUrl]);

  const sceneStyle = {
    aspectRatio: previewAspectRatio,
    "--scene-accent-a": sceneAccentA,
    "--scene-accent-b": sceneAccentB,
    "--scene-accent-c": sceneAccentC,
  } as CSSProperties;

  const drawBackgroundCanvas = useCallback(() => {
    const canvas = backgroundCanvasRef.current;
    const image = backgroundImageRef.current;
    if (!canvas) {
      return;
    }

    const width = Math.max(1, Math.round(renderWidth));
    const height = Math.max(1, Math.round(renderHeight));

    if (canvas.width !== width) {
      canvas.width = width;
    }

    if (canvas.height !== height) {
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return;
    }

    const coverScale = Math.max(
      width / image.naturalWidth,
      height / image.naturalHeight,
    );
    const baseW = image.naturalWidth * coverScale;
    const baseH = image.naturalHeight * coverScale;
    const sceneZoom = 1.18;
    const drawW = baseW * sceneZoom;
    const drawH = baseH * sceneZoom;
    const x = (width - drawW) / 2;
    const y = (height - drawH) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.save();
    ctx.filter = `blur(${Math.max(8, posterBlurStrength)}px) saturate(1.05)`;
    ctx.drawImage(image, x, y, drawW, drawH);
    ctx.restore();

    const dimOpacity = Math.min(0.85, Math.max(0, backgroundDimStrength));
    if (dimOpacity > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${dimOpacity})`;
      ctx.fillRect(0, 0, width, height);
    }
  }, [backgroundDimStrength, posterBlurStrength, renderHeight, renderWidth]);

  useEffect(() => {
    drawBackgroundRef.current = drawBackgroundCanvas;
    drawBackgroundCanvas();
  }, [drawBackgroundCanvas]);

  useEffect(() => {
    const loadId = backgroundLoadIdRef.current + 1;
    backgroundLoadIdRef.current = loadId;

    if (!sceneBackgroundUrl) {
      backgroundImageRef.current = null;
      drawBackgroundRef.current();
      return;
    }

    const image = new window.Image();
    image.decoding = "async";

    image.onload = () => {
      if (backgroundLoadIdRef.current !== loadId) {
        return;
      }

      backgroundImageRef.current = image;
      drawBackgroundRef.current();
    };

    image.onerror = () => {
      if (backgroundLoadIdRef.current !== loadId) {
        return;
      }

      // Preserve previously loaded image if current request fails.
      drawBackgroundRef.current();
    };

    image.src = sceneBackgroundUrl;
  }, [sceneBackgroundUrl]);

  const eqStyle = {
    left: `${(1 - liveEqualizerConfig.width) * 50}%`,
    width: `${liveEqualizerConfig.width * 100}%`,
    height: `${liveEqualizerConfig.height * 100}%`,
    top: `${liveEqualizerConfig.y * 100}%`,
  } as CSSProperties;

  const backgroundDrift = useMemo(
    () =>
      getParallaxBackgroundDriftAtMs({
        timeMs: previewTimeMs,
        strength: parallaxDriftStrength,
        baseWidthPx: renderWidth,
        baseHeightPx: renderHeight,
      }),
    [parallaxDriftStrength, previewTimeMs, renderHeight, renderWidth],
  );

  const trackTextStyle = {
    left: `${trackTextX * 100}%`,
    top: `${trackTextY * 100}%`,
    color: trackTextColor,
    textAlign: trackTextAlign,
    transform:
      trackTextAlign === "center"
        ? "translateX(-50%)"
        : trackTextAlign === "right"
          ? "translateX(-100%)"
          : "translateX(0)",
  } as CSSProperties;

  const previewScale =
    sceneHeightPx > 0 ? sceneHeightPx / Math.max(1, renderHeight) : 1;
  const previewSongSizePx = Math.max(
    14,
    Math.round(trackTextSize * previewScale),
  );
  const previewArtistSizePx = Math.max(
    12,
    Math.round(previewSongSizePx * 0.72),
  );
  const previewGapPx = Math.max(0, Math.round(trackTextGap * previewScale));
  const previewPosterCornerRadiusPx = Math.max(
    0,
    Math.round(posterCornerRadius * previewScale),
  );
  const previewBannerBorderWidthPx = Math.max(
    0,
    Math.round(bannerBorderWidth * previewScale),
  );

  const trackArtistStyle = {
    fontSize: `${previewArtistSizePx}px`,
  } as CSSProperties;

  const trackSongStyle = {
    fontSize: `${previewSongSizePx}px`,
    marginTop: `${previewGapPx}px`,
  } as CSSProperties;

  const posterWrapStyle = {
    transform: `scale(${posterPulseScale.toFixed(4)})`,
    transformOrigin: "center center",
    transition: "transform 75ms linear",
  } as CSSProperties;

  const posterSizePercent = Math.max(20, Math.min(80, bannerScale * 100));
  const posterBoxStyle = {
    ...posterWrapStyle,
    width: `${posterSizePercent}%`,
    aspectRatio: "1 / 1",
    maxWidth: "100%",
  } as CSSProperties;

  const backgroundDriftStyle = {
    transform: `translate(${backgroundDrift.offset.x.toFixed(2)}px, ${backgroundDrift.offset.y.toFixed(2)}px) scale(${backgroundDrift.zoomScale.toFixed(4)})`,
    transformOrigin: "center center",
  } as CSSProperties;

  const scenePunchStyle = {
    position: "absolute",
    inset: 0,
    zIndex: 3,
    transform: `scale(${cameraPunchScale.toFixed(4)})`,
    transformOrigin: "center center",
    transition: "transform 75ms linear",
  } as CSSProperties;

  function openBackgroundPicker() {
    backgroundFileInputRef.current?.click();
  }

  function openPosterPicker() {
    posterFileInputRef.current?.click();
  }

  function handlePosterChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) {
      return;
    }

    if (posterPreviewUrl) {
      URL.revokeObjectURL(posterPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPosterPreviewUrl(objectUrl);
    onPosterFileSelected(selectedFile);
    event.target.value = "";
  }

  function handleBackgroundChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) {
      return;
    }

    if (backgroundPreviewUrl) {
      URL.revokeObjectURL(backgroundPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setBackgroundPreviewUrl(objectUrl);
    onBackgroundFileSelected(selectedFile);
    event.target.value = "";
  }

  return (
    <section className="preview-panel">
      <h2>Layer Preview</h2>
      <input
        ref={backgroundFileInputRef}
        className="scene-hidden-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        title="Select background image"
        onChange={handleBackgroundChange}
      />
      <input
        ref={posterFileInputRef}
        className="scene-hidden-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        title="Select poster image"
        onChange={handlePosterChange}
      />
      <div
        ref={sceneRef}
        onClick={openBackgroundPicker}
        className="scene"
        style={sceneStyle}
      >
        <canvas
          ref={backgroundCanvasRef}
          className="scene-bg-canvas"
          style={backgroundDriftStyle}
        />

        <div style={scenePunchStyle}>
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
              <div className={`scene-eq-bars scene-eq-bars--${visualizerType}`}>
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

          <div className="scene-poster-wrap cursor-pointer hover:brightness-110">
            <div
              className="absolute inset-0"
              onClick={(event) => {
                event.stopPropagation();
                openBackgroundPicker();
              }}
            />

            <div
              className="relative z-10"
              style={posterBoxStyle}
              onClick={(event) => {
                event.stopPropagation();
                openPosterPicker();
              }}
            >
              {scenePosterUrl ? (
                <Image
                  className="scene-poster object-cover w-full h-full"
                  src={scenePosterUrl}
                  alt="Poster preview"
                  width={1024}
                  height={1024}
                  style={{
                    borderRadius: `${previewPosterCornerRadiusPx}px`,
                    borderStyle: "solid",
                    borderColor: bannerBorderEnabled
                      ? bannerBorderColor
                      : "transparent",
                    borderWidth: bannerBorderEnabled
                      ? `${previewBannerBorderWidthPx}px`
                      : "0px",
                  }}
                  unoptimized
                />
              ) : (
                <div className="border w-full h-full rounded-2xl flex items-center justify-center">
                  +
                </div>
              )}
            </div>
          </div>

          <div className="scene-track-text" style={trackTextStyle}>
            <p className="scene-track-text-artist" style={trackArtistStyle}>
              {artistName || "Unknown Artist"}
            </p>
            <p
              className="scene-track-text-song text-nowrap"
              style={trackSongStyle}
            >
              {songName || "Untitled Track"}
            </p>
          </div>
        </div>
      </div>
      <p className="layer-note">
        Layer order: blurred poster background, live equalizer, center poster.
      </p>
    </section>
  );
}

export function PreviewTimelinePanel({
  previewTimelineEnabled,
  isPlaying,
  onTogglePlayback,
  onSeekTo,
  onCutToSelection,
  timeline,
  trackDurationMs,
  trimInX,
  trimOutX,
  playheadX,
  waveformValues,
  onUpdateTrim,
}: PreviewTimelinePanelProps) {
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [draftSelection, setDraftSelection] = useState<{
    startMs: number;
    endMs: number;
  } | null>(null);
  const [selectedRange, setSelectedRange] = useState<{
    startMs: number;
    endMs: number;
  } | null>(null);

  const activeSelection = useMemo(() => {
    const source = draftSelection ?? selectedRange;
    if (!source) {
      return null;
    }

    return {
      startMs: Math.min(source.startMs, source.endMs),
      endMs: Math.max(source.startMs, source.endMs),
    };
  }, [draftSelection, selectedRange]);

  const selectedRangeX = useMemo(() => {
    if (!activeSelection) {
      return null;
    }

    const startX = (activeSelection.startMs / trackDurationMs) * TIMELINE_WIDTH;
    const endX = (activeSelection.endMs / trackDurationMs) * TIMELINE_WIDTH;
    return {
      x: startX,
      width: Math.max(2, endX - startX),
    };
  }, [activeSelection, trackDurationMs]);

  const hoverX = useMemo(() => {
    if (hoverMs === null) {
      return null;
    }

    return (hoverMs / trackDurationMs) * TIMELINE_WIDTH;
  }, [hoverMs, trackDurationMs]);

  function getTimelineMsFromClientX(clientX: number, element: HTMLDivElement) {
    const rect = element.getBoundingClientRect();
    const relative = clamp(
      (clientX - rect.left) / Math.max(1, rect.width),
      0,
      1,
    );
    return Math.round(relative * trackDurationMs);
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const ms = getTimelineMsFromClientX(event.clientX, target);
    setDraftSelection({ startMs: ms, endMs: ms });
    setSelectedRange(null);
    setHoverMs(ms);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const ms = getTimelineMsFromClientX(event.clientX, event.currentTarget);
    setHoverMs(ms);

    setDraftSelection((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        endMs: ms,
      };
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    const ms = getTimelineMsFromClientX(event.clientX, target);
    setHoverMs(ms);

    const currentDraft = draftSelection;
    if (!currentDraft) {
      return;
    }

    const startMs = Math.min(currentDraft.startMs, ms);
    const endMs = Math.max(currentDraft.startMs, ms);

    setDraftSelection(null);

    if (endMs - startMs < 120) {
      setSelectedRange(null);
      onSeekTo(ms);
      return;
    }

    setSelectedRange({ startMs, endMs });
  }

  function handleCutSelection() {
    if (!selectedRange) {
      return;
    }

    onCutToSelection(selectedRange.startMs, selectedRange.endMs);
    onSeekTo(selectedRange.startMs);
    setSelectedRange(null);
  }

  function toClampedNumber(input: string, min: number, max: number) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  if (!previewTimelineEnabled) {
    return (
      <section className="timeline-panel timeline-panel--dock">
        <p className="layer-note">
          Feature flag preview_timeline_v1 is disabled.
        </p>
      </section>
    );
  }

  return (
    <section className="timeline-panel timeline-panel--dock">
      <div className="timeline-head">
        <strong>Timeline v1</strong>
        <div className="timeline-head-actions">
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={onTogglePlayback}
          >
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => onSeekTo(timeline.trimInMs)}
            disabled={isPlaying}
          >
            Jump Trim In
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={handleCutSelection}
            disabled={isPlaying || !selectedRange}
          >
            Scissors
          </Button>
        </div>
      </div>

      <div
        className="timeline-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverMs(null)}
      >
        <svg
          viewBox={`0 0 ${TIMELINE_WIDTH} ${TIMELINE_HEIGHT}`}
          role="img"
          aria-label="Waveform"
        >
          <rect
            x="0"
            y="0"
            width={TIMELINE_WIDTH}
            height={TIMELINE_HEIGHT}
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
            height={TIMELINE_HEIGHT}
            fill="rgba(0,0,0,0.55)"
          />
          <rect
            x={trimOutX}
            y="0"
            width={Math.max(0, TIMELINE_WIDTH - trimOutX)}
            height={TIMELINE_HEIGHT}
            fill="rgba(0,0,0,0.55)"
          />
          <line
            x1={trimInX}
            y1="0"
            x2={trimInX}
            y2={TIMELINE_HEIGHT}
            stroke="#ffc066"
            strokeWidth="2"
          />
          <line
            x1={trimOutX}
            y1="0"
            x2={trimOutX}
            y2={TIMELINE_HEIGHT}
            stroke="#ffc066"
            strokeWidth="2"
          />
          <line
            x1={playheadX}
            y1="0"
            x2={playheadX}
            y2={TIMELINE_HEIGHT}
            stroke="#ff6d62"
            strokeWidth="2"
          />
          {selectedRangeX ? (
            <rect
              x={selectedRangeX.x}
              y="0"
              width={selectedRangeX.width}
              height={TIMELINE_HEIGHT}
              fill="rgba(0, 214, 255, 0.22)"
              stroke="rgba(0, 214, 255, 0.85)"
              strokeWidth="1"
            />
          ) : null}
          {hoverX !== null ? (
            <line
              x1={hoverX}
              y1="0"
              x2={hoverX}
              y2={TIMELINE_HEIGHT}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ) : null}
        </svg>
      </div>

      <div className="timeline-sliders">
        <label>
          Playhead ({formatMs(timeline.playheadMs ?? timeline.trimInMs)})
        </label>
        <label>
          Trim in ({formatMs(timeline.trimInMs)})
          <div className="timeline-slider-row">
            <input
              type="range"
              min={0}
              max={Math.max(1, timeline.trimOutMs - 1)}
              step={10}
              value={timeline.trimInMs}
              onChange={(event) => {
                onUpdateTrim(Number(event.target.value), timeline.trimOutMs);
              }}
            />
            <input
              type="number"
              min={0}
              max={Math.max(1, timeline.trimOutMs - 1)}
              step={10}
              value={timeline.trimInMs}
              onChange={(event) => {
                const next = toClampedNumber(
                  event.target.value,
                  0,
                  Math.max(1, timeline.trimOutMs - 1),
                );
                if (next !== null) {
                  onUpdateTrim(next, timeline.trimOutMs);
                }
              }}
            />
          </div>
        </label>
        <label>
          Trim out ({formatMs(timeline.trimOutMs)})
          <div className="timeline-slider-row">
            <input
              type="range"
              min={Math.min(trackDurationMs, timeline.trimInMs + 1)}
              max={trackDurationMs}
              step={10}
              value={timeline.trimOutMs}
              onChange={(event) => {
                onUpdateTrim(timeline.trimInMs, Number(event.target.value));
              }}
            />
            <input
              type="number"
              min={Math.min(trackDurationMs, timeline.trimInMs + 1)}
              max={trackDurationMs}
              step={10}
              value={timeline.trimOutMs}
              onChange={(event) => {
                const next = toClampedNumber(
                  event.target.value,
                  Math.min(trackDurationMs, timeline.trimInMs + 1),
                  trackDurationMs,
                );
                if (next !== null) {
                  onUpdateTrim(timeline.trimInMs, next);
                }
              }}
            />
          </div>
        </label>
      </div>
    </section>
  );
}
