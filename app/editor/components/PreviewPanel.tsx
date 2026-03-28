import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";

import { TIMELINE_HEIGHT, TIMELINE_WIDTH } from "@/app/editor/constants";
import type {
  TimelineKeyframeParameter,
  TimelineKeyframeTrack,
  TimelineState,
  VisualizerType,
} from "@/app/editor/types";
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
};

type PreviewTimelinePanelProps = {
  previewTimelineEnabled: boolean;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onSeekTo: (value: number) => void;
  timeline: TimelineState;
  trackDurationMs: number;
  trimInX: number;
  trimOutX: number;
  playheadX: number;
  waveformValues: number[];
  onUpdateTrim: (trimInMs: number, trimOutMs: number) => void;
  selectedKeyframeParameter: TimelineKeyframeParameter;
  onSelectedKeyframeParameterChange: (value: TimelineKeyframeParameter) => void;
  onAddKeyframe: () => void;
  onClearSelectedKeyframes: () => void;
  keyframes: TimelineKeyframeTrack[];
};

export function PreviewPanel({
  previewAspectRatio,
  sceneAccentA,
  sceneAccentB,
  sceneAccentC,
  posterAssetId,
  backgroundAssetId,
  posterBlurStrength,
  liveEqualizerConfig,
  onPosterFileSelected,
  onBackgroundFileSelected,
  visualizerType,
  normalizedVisualizerBars,
  equalizerLineD,
  posterCornerRadius,
}: PreviewPanelProps) {
  const backgroundFileInputRef = useRef<HTMLInputElement | null>(null);
  const posterFileInputRef = useRef<HTMLInputElement | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<
    string | null
  >(null);

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

  const sceneStyle = {
    aspectRatio: previewAspectRatio,
    "--scene-accent-a": sceneAccentA,
    "--scene-accent-b": sceneAccentB,
    "--scene-accent-c": sceneAccentC,
  } as CSSProperties;

  const sceneBgStyle = {
    backgroundImage: sceneBackgroundUrl
      ? `url(${sceneBackgroundUrl})`
      : undefined,
    filter: `blur(${Math.max(8, posterBlurStrength)}px) brightness(0.52) saturate(1.05)`,
  } as CSSProperties;

  const eqStyle = {
    left: `${(1 - liveEqualizerConfig.width) * 50}%`,
    width: `${liveEqualizerConfig.width * 100}%`,
    height: `${liveEqualizerConfig.height * 100}%`,
    top: `${liveEqualizerConfig.y * 100}%`,
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
      <div onClick={openBackgroundPicker} className="scene" style={sceneStyle}>
        <div className="scene-bg " style={sceneBgStyle} />

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
            className="relative z-10 w-60 h-60 "
            onClick={(event) => {
              event.stopPropagation();
              openPosterPicker();
            }}
          >
            {posterPreviewUrl ? (
              <Image
                className="scene-poster object-cover w-full h-full"
                src={posterPreviewUrl}
                alt="Poster preview"
                width={1024}
                height={1024}
                style={{ borderRadius: `${posterCornerRadius}px` }}
                unoptimized
              />
            ) : (
              <div className="border w-60 h-60 rounded-2xl flex items-center justify-center">
                +
              </div>
            )}
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
  timeline,
  trackDurationMs,
  trimInX,
  trimOutX,
  playheadX,
  waveformValues,
  onUpdateTrim,
  selectedKeyframeParameter,
  onSelectedKeyframeParameterChange,
  onAddKeyframe,
  onClearSelectedKeyframes,
  keyframes,
}: PreviewTimelinePanelProps) {
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
          <button type="button" onClick={onTogglePlayback}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => onSeekTo(timeline.trimInMs)}
            disabled={isPlaying}
          >
            Jump Trim In
          </button>
        </div>
      </div>

      <div className="timeline-canvas">
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
            onChange={(event) => onSeekTo(Number(event.target.value))}
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
              onUpdateTrim(Number(event.target.value), timeline.trimOutMs);
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
              onUpdateTrim(timeline.trimInMs, Number(event.target.value));
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
              onSelectedKeyframeParameterChange(
                event.target.value as TimelineKeyframeParameter,
              )
            }
          >
            <option value="equalizer.width">Equalizer width</option>
            <option value="equalizer.height">Equalizer height</option>
            <option value="equalizer.y">Equalizer Y</option>
          </select>
        </label>
        <button type="button" onClick={onAddKeyframe}>
          Add Keyframe @ Playhead
        </button>
        <button type="button" onClick={onClearSelectedKeyframes}>
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
  );
}
