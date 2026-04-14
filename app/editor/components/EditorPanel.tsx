import { type DragEvent, type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { VISUALIZER_TYPE_OPTIONS } from "@/app/editor/constants";
import type {
  Format,
  Quality,
  TemplateItem,
  VisualizerType,
} from "@/app/editor/types";

type EditorPanelProps = {
  clientToken: string;
  projectName: string;
  format: Format;
  quality: Quality;
  selectedTemplateId: string | null;
  templates: TemplateItem[];
  equalizerColor: string;
  equalizerWidth: number;
  equalizerHeight: number;
  equalizerY: number;
  equalizerGlowStrength: number;
  equalizerGlowColor: string;
  equalizerGlowSpread: number;
  visualizerType: VisualizerType;
  visualizerBarCount: number;
  posterBlurStrength: number;
  backgroundDimStrength: number;
  posterCornerRadius: number;
  posterBeatScaleStrength: number;
  beatStrobeSoftStrength: number;
  beatStrobeSoftColor: string;
  cameraPunchStrength: number;
  lowEndShakeStrength: number;
  parallaxDriftStrength: number;
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
  projectId: string;
  status: string;
  isBusy: boolean;
  trackAssetId: string;
  posterAssetId: string;
  backgroundAssetId: string;
  analysisId: string;
  analysisStatus: string;
  renderJobId: string;
  renderStatus: string;
  renderProgress: number;
  previewTimelineEnabled: boolean;
  previewStartupMs: number;
  previewDriftMs: number;
  previewFps: number;
  onClientTokenChange: (value: string) => void;
  onProjectNameChange: (value: string) => void;
  onFormatChange: (value: Format) => void;
  onQualityChange: (value: Quality) => void;
  onTemplateChange: (templateId: string | null) => void;
  onEqualizerColorChange: (value: string) => void;
  onEqualizerWidthChange: (value: number) => void;
  onEqualizerHeightChange: (value: number) => void;
  onEqualizerYChange: (value: number) => void;
  onEqualizerGlowStrengthChange: (value: number) => void;
  onEqualizerGlowColorChange: (value: string) => void;
  onEqualizerGlowSpreadChange: (value: number) => void;
  onVisualizerTypeChange: (value: VisualizerType) => void;
  onVisualizerBarCountChange: (value: number) => void;
  onPosterBlurStrengthChange: (value: number) => void;
  onBackgroundDimStrengthChange: (value: number) => void;
  onPosterCornerRadiusChange: (value: number) => void;
  onPosterBeatScaleStrengthChange: (value: number) => void;
  onBeatStrobeSoftStrengthChange: (value: number) => void;
  onBeatStrobeSoftColorChange: (value: string) => void;
  onCameraPunchStrengthChange: (value: number) => void;
  onLowEndShakeStrengthChange: (value: number) => void;
  onParallaxDriftStrengthChange: (value: number) => void;
  onBannerScaleChange: (value: number) => void;
  onBannerBorderEnabledChange: (value: boolean) => void;
  onBannerBorderColorChange: (value: string) => void;
  onBannerBorderWidthChange: (value: number) => void;
  onArtistNameChange: (value: string) => void;
  onSongNameChange: (value: string) => void;
  onTrackTextColorChange: (value: string) => void;
  onTrackTextXChange: (value: number) => void;
  onTrackTextYChange: (value: number) => void;
  onTrackTextSizeChange: (value: number) => void;
  onTrackTextGapChange: (value: number) => void;
  onTrackTextAlignChange: (value: "left" | "center" | "right") => void;
  onSubmitProject: (event: FormEvent) => void;
  onUploadTrack: (file: File) => void;
  onAnalyzeTrack: () => void;
  onStartRender: () => void;
  onDownloadRender: () => void;
  onCancelRender: () => void;
  onRetryRender: () => void;
  onProjectIdChange: (value: string) => void;
  onLoadProject: () => void;
  onSaveTimeline: () => void;
};

export function EditorPanel(props: EditorPanelProps) {
  const [trackFile, setTrackFile] = useState<File | null>(null);
  const [isTrackDropActive, setIsTrackDropActive] = useState(false);
  const [activeTab, setActiveTab] = useState("project");

  const trackLabel = useMemo(() => {
    if (!trackFile) {
      return "No file selected";
    }

    return `${trackFile.name}`;
  }, [trackFile]);

  function toClampedNumber(input: string, min: number, max: number) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  function clampAlpha(value: number) {
    return Math.min(1, Math.max(0, value));
  }

  function parseColorForControl(color: string) {
    const raw = color.trim();
    const hexMatch = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(raw);
    if (hexMatch) {
      const hex = hexMatch[1];
      const alpha =
        hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return {
        hex: `#${hex.slice(0, 6)}`,
        alpha: clampAlpha(alpha),
      };
    }

    const rgbaMatch =
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i.exec(
        raw,
      );
    if (!rgbaMatch) {
      return { hex: "#ffffff", alpha: 1 };
    }

    const r = Math.min(255, Math.max(0, Number(rgbaMatch[1]) || 255));
    const g = Math.min(255, Math.max(0, Number(rgbaMatch[2]) || 255));
    const b = Math.min(255, Math.max(0, Number(rgbaMatch[3]) || 255));
    const a = clampAlpha(
      rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]) || 1,
    );

    const hex = `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g)
      .toString(16)
      .padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
    return {
      hex,
      alpha: a,
    };
  }

  function toRgbaFromHex(hexColor: string, alpha: number) {
    const normalized = hexColor.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return `rgba(255, 255, 255, ${clampAlpha(alpha).toFixed(3)})`;
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clampAlpha(alpha).toFixed(3)})`;
  }

  const equalizerColorControl = parseColorForControl(props.equalizerColor);
  const glowColorControl = parseColorForControl(props.equalizerGlowColor);
  const beatStrobeColorControl = parseColorForControl(
    props.beatStrobeSoftColor,
  );
  const bannerBorderColorControl = parseColorForControl(
    props.bannerBorderColor,
  );
  const trackTextColorControl = parseColorForControl(props.trackTextColor);

  function toSliderNumber(value: number | readonly number[]) {
    if (Array.isArray(value)) {
      return value[0] ?? 0;
    }

    return value;
  }

  function renderRangeControl({
    value,
    min,
    max,
    step,
    onChange,
    disabled = false,
    round = false,
  }: {
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    round?: boolean;
  }) {
    return (
      <div className="editor-range-row">
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          disabled={disabled}
          onValueChange={(nextValue) => {
            const next = toSliderNumber(nextValue);
            onChange(round ? Math.round(next) : next);
          }}
        />
        <input
          type="number"
          title="Value"
          aria-label="Value"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = toClampedNumber(event.target.value, min, max);
            if (next !== null) {
              onChange(round ? Math.round(next) : next);
            }
          }}
        />
      </div>
    );
  }

  function renderColorControl({
    control,
    onChange,
    disabled = false,
  }: {
    control: { hex: string; alpha: number };
    onChange: (value: string) => void;
    disabled?: boolean;
  }) {
    return (
      <div className="editor-color-control">
        <div className="editor-color-head">
          <input
            type="color"
            value={control.hex}
            disabled={disabled}
            title="Color"
            aria-label="Color"
            onChange={(event) =>
              onChange(toRgbaFromHex(event.target.value, control.alpha))
            }
          />
          <span className="editor-color-code">{control.hex.toUpperCase()}</span>
          <span className="editor-opacity-pill">
            {Math.round(control.alpha * 100)}%
          </span>
        </div>
        <div className="editor-opacity-row">
          <Slider
            className="editor-opacity-slider"
            min={0}
            max={1}
            step={0.01}
            value={[control.alpha]}
            disabled={disabled}
            title="Opacity slider"
            aria-label="Opacity slider"
            onValueChange={(nextValue) =>
              onChange(toRgbaFromHex(control.hex, toSliderNumber(nextValue)))
            }
          />
          <input
            className="editor-opacity-number"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={control.alpha}
            disabled={disabled}
            title="Opacity"
            aria-label="Opacity"
            onChange={(event) => {
              const next = toClampedNumber(event.target.value, 0, 1);
              if (next !== null) {
                onChange(toRgbaFromHex(control.hex, next));
              }
            }}
          />
        </div>
      </div>
    );
  }

  function handleTrackDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsTrackDropActive(true);
  }

  function handleTrackDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsTrackDropActive(false);
  }

  function handleTrackDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsTrackDropActive(false);

    const file = event.dataTransfer.files?.[0] ?? null;
    if (file && file.type.startsWith("audio/")) {
      setTrackFile(file);
    }
  }

  return (
    <section className="editor-panel">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="editor-tabs"
      >
        <TabsList className="editor-tabs-list">
          <TabsTrigger value="project">Project</TabsTrigger>
          <TabsTrigger value="visual">Visual</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
        </TabsList>

        <form className="editor-grid" onSubmit={props.onSubmitProject}>
          <TabsContent value="project" className="editor-tab-content">
            <label>
              Client token
              <input
                value={props.clientToken}
                onChange={(event) =>
                  props.onClientTokenChange(event.target.value)
                }
                required
              />
            </label>

            <label>
              Project name
              <input
                value={props.projectName}
                onChange={(event) =>
                  props.onProjectNameChange(event.target.value)
                }
                required
              />
            </label>

            <label>
              Format
              <Select
                value={props.format}
                onValueChange={(value) => props.onFormatChange(value as Format)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiktok">TikTok 9:16</SelectItem>
                  <SelectItem value="youtube">YouTube 16:9</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label>
              Quality
              <Select
                value={props.quality}
                onValueChange={(value) =>
                  props.onQualityChange(value as Quality)
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hd">HD</SelectItem>
                  <SelectItem value="fhd">FHD</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label>
              Template
              <Select
                value={props.selectedTemplateId ?? "__none"}
                onValueChange={(value) =>
                  props.onTemplateChange(value === "__none" ? null : value)
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {props.templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </TabsContent>

          <TabsContent value="visual" className="editor-tab-content">
            <div className="editor-feature-group editor-feature-group--colors">
              <h4>Color Controls</h4>
              <div className="editor-feature-fields">
                <label>
                  Equalizer color
                  {renderColorControl({
                    control: equalizerColorControl,
                    onChange: props.onEqualizerColorChange,
                  })}
                </label>

                <label>
                  Glow color
                  {renderColorControl({
                    control: glowColorControl,
                    onChange: props.onEqualizerGlowColorChange,
                  })}
                </label>

                <label>
                  Beat strobe color
                  {renderColorControl({
                    control: beatStrobeColorControl,
                    onChange: props.onBeatStrobeSoftColorChange,
                  })}
                </label>

                <label>
                  Text color
                  {renderColorControl({
                    control: trackTextColorControl,
                    onChange: props.onTrackTextColorChange,
                  })}
                </label>

                <label>
                  Banner border
                  <div className="editor-range-row">
                    <Select
                      value={props.bannerBorderEnabled ? "on" : "off"}
                      onValueChange={(value) =>
                        props.onBannerBorderEnabledChange(value === "on")
                      }
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue placeholder="Border" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on">Enabled</SelectItem>
                        <SelectItem value="off">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {renderColorControl({
                    control: bannerBorderColorControl,
                    onChange: props.onBannerBorderColorChange,
                    disabled: !props.bannerBorderEnabled,
                  })}
                </label>
              </div>
            </div>

            <div className="editor-feature-group">
              <h4>Equalizer</h4>
              <div className="editor-feature-fields">
                <label>
                  Equalizer width
                  {renderRangeControl({
                    value: props.equalizerWidth,
                    min: 0.1,
                    max: 1,
                    step: 0.01,
                    onChange: props.onEqualizerWidthChange,
                  })}
                </label>

                <label>
                  Equalizer height
                  {renderRangeControl({
                    value: props.equalizerHeight,
                    min: 0.05,
                    max: 0.4,
                    step: 0.01,
                    onChange: props.onEqualizerHeightChange,
                  })}
                </label>

                <label>
                  Equalizer Y
                  {renderRangeControl({
                    value: props.equalizerY,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    onChange: props.onEqualizerYChange,
                  })}
                </label>

                <label>
                  Visualizer type
                  <Select
                    value={props.visualizerType}
                    onValueChange={(value) =>
                      props.onVisualizerTypeChange(value as VisualizerType)
                    }
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder="Visualizer" />
                    </SelectTrigger>
                    <SelectContent>
                      {VISUALIZER_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label>
                  Visualizer bar count ({props.visualizerBarCount})
                  {renderRangeControl({
                    value: props.visualizerBarCount,
                    min: 8,
                    max: 96,
                    step: 1,
                    onChange: props.onVisualizerBarCountChange,
                    round: true,
                  })}
                </label>

                <label>
                  Spectrum glow ({props.equalizerGlowStrength.toFixed(2)}x)
                  {renderRangeControl({
                    value: props.equalizerGlowStrength,
                    min: 0,
                    max: 6,
                    step: 0.01,
                    onChange: props.onEqualizerGlowStrengthChange,
                  })}
                </label>

                <label>
                  Glow spread ({props.equalizerGlowSpread.toFixed(2)}x)
                  {renderRangeControl({
                    value: props.equalizerGlowSpread,
                    min: 0,
                    max: 4,
                    step: 0.01,
                    onChange: props.onEqualizerGlowSpreadChange,
                  })}
                </label>
              </div>
            </div>

            <div className="editor-feature-group">
              <h4>Poster & Background</h4>
              <div className="editor-feature-fields">
                <label>
                  Background blur
                  {renderRangeControl({
                    value: props.posterBlurStrength,
                    min: 8,
                    max: 36,
                    step: 1,
                    onChange: props.onPosterBlurStrengthChange,
                    round: true,
                  })}
                </label>

                <label>
                  Background dim (
                  {Math.round(props.backgroundDimStrength * 100)}%)
                  {renderRangeControl({
                    value: props.backgroundDimStrength,
                    min: 0,
                    max: 0.85,
                    step: 0.01,
                    onChange: props.onBackgroundDimStrengthChange,
                  })}
                </label>

                <label>
                  Banner size ({Math.round(props.bannerScale * 100)}%)
                  {renderRangeControl({
                    value: props.bannerScale,
                    min: 0.2,
                    max: 0.8,
                    step: 0.01,
                    onChange: props.onBannerScaleChange,
                  })}
                </label>

                <label>
                  Banner border width
                  {renderRangeControl({
                    value: props.bannerBorderWidth,
                    min: 0,
                    max: 12,
                    step: 1,
                    onChange: props.onBannerBorderWidthChange,
                    disabled: !props.bannerBorderEnabled,
                    round: true,
                  })}
                </label>

                <label>
                  Poster corner radius
                  {renderRangeControl({
                    value: props.posterCornerRadius,
                    min: 6,
                    max: 40,
                    step: 1,
                    onChange: props.onPosterCornerRadiusChange,
                    round: true,
                  })}
                </label>
              </div>
            </div>

            <div className="editor-feature-group">
              <h4>Motion FX</h4>
              <div className="editor-feature-fields">
                <label>
                  Beat scale strength (
                  {props.posterBeatScaleStrength.toFixed(2)}x)
                  {renderRangeControl({
                    value: props.posterBeatScaleStrength,
                    min: 0,
                    max: 5,
                    step: 0.05,
                    onChange: props.onPosterBeatScaleStrengthChange,
                  })}
                </label>

                <label>
                  Camera punch ({props.cameraPunchStrength.toFixed(2)}x)
                  {renderRangeControl({
                    value: props.cameraPunchStrength,
                    min: 0,
                    max: 3,
                    step: 0.05,
                    onChange: props.onCameraPunchStrengthChange,
                  })}
                </label>

                <label>
                  Beat strobe soft ({props.beatStrobeSoftStrength.toFixed(2)}x)
                  {renderRangeControl({
                    value: props.beatStrobeSoftStrength,
                    min: 0,
                    max: 3,
                    step: 0.05,
                    onChange: props.onBeatStrobeSoftStrengthChange,
                  })}
                </label>

                <label>
                  Low-end shake ({props.lowEndShakeStrength.toFixed(2)}x)
                  {renderRangeControl({
                    value: props.lowEndShakeStrength,
                    min: 0,
                    max: 3,
                    step: 0.05,
                    onChange: props.onLowEndShakeStrengthChange,
                  })}
                </label>

                <label>
                  Parallax drift ({props.parallaxDriftStrength.toFixed(2)}x)
                  {renderRangeControl({
                    value: props.parallaxDriftStrength,
                    min: 0,
                    max: 3,
                    step: 0.05,
                    onChange: props.onParallaxDriftStrengthChange,
                  })}
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="text" className="editor-tab-content">
            <label>
              Artist
              <input
                value={props.artistName}
                onChange={(event) =>
                  props.onArtistNameChange(event.target.value)
                }
                maxLength={120}
              />
            </label>

            <label>
              Song name
              <input
                value={props.songName}
                onChange={(event) => props.onSongNameChange(event.target.value)}
                maxLength={120}
              />
            </label>

            <label>
              Text align
              <Select
                value={props.trackTextAlign}
                onValueChange={(value) =>
                  props.onTrackTextAlignChange(
                    value as "left" | "center" | "right",
                  )
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Text align" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label>
              Text X ({props.trackTextX.toFixed(2)})
              {renderRangeControl({
                value: props.trackTextX,
                min: 0,
                max: 1,
                step: 0.01,
                onChange: props.onTrackTextXChange,
              })}
            </label>

            <label>
              Text Y ({props.trackTextY.toFixed(2)})
              {renderRangeControl({
                value: props.trackTextY,
                min: 0,
                max: 1,
                step: 0.01,
                onChange: props.onTrackTextYChange,
              })}
            </label>

            <label>
              Text size ({Math.round(props.trackTextSize)} px)
              {renderRangeControl({
                value: props.trackTextSize,
                min: 14,
                max: 120,
                step: 1,
                onChange: props.onTrackTextSizeChange,
                round: true,
              })}
            </label>

            <label>
              Text gap ({Math.round(props.trackTextGap)} px)
              {renderRangeControl({
                value: props.trackTextGap,
                min: 0,
                max: 120,
                step: 1,
                onChange: props.onTrackTextGapChange,
                round: true,
              })}
            </label>
          </TabsContent>

          <TabsContent value="media" className="editor-tab-content">
            <label>
              Track upload
              <div
                className={`track-dropzone ${isTrackDropActive ? "track-dropzone--active" : ""}`}
                onDragOver={handleTrackDragOver}
                onDragLeave={handleTrackDragLeave}
                onDrop={handleTrackDrop}
              >
                <span>Drop audio file here or choose manually</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) =>
                    setTrackFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>
              <small>{trackLabel}</small>
            </label>

            <div className="editor-actions">
              <Button
                type="button"
                size="xs"
                disabled={props.isBusy || !trackFile}
                onClick={() => {
                  if (trackFile) {
                    props.onUploadTrack(trackFile);
                  }
                }}
              >
                Upload Track
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={props.isBusy}
                onClick={props.onAnalyzeTrack}
              >
                Analyze
              </Button>
              <Button type="submit" size="xs" disabled={props.isBusy}>
                Save Project
              </Button>
            </div>

            <div className="editor-actions">
              <Button
                type="button"
                size="xs"
                disabled={props.isBusy}
                onClick={props.onStartRender}
              >
                Export MP4
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={props.isBusy || props.renderStatus !== "done"}
                onClick={props.onDownloadRender}
              >
                Download Render
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={
                  props.isBusy ||
                  (props.renderStatus !== "queued" &&
                    props.renderStatus !== "processing")
                }
                onClick={props.onCancelRender}
              >
                Cancel Render
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={
                  props.isBusy ||
                  (props.renderStatus !== "failed" &&
                    props.renderStatus !== "canceled")
                }
                onClick={props.onRetryRender}
              >
                Retry Render
              </Button>
            </div>

            <div className="editor-actions editor-load-row">
              <input
                placeholder="project id"
                value={props.projectId}
                onChange={(event) =>
                  props.onProjectIdChange(event.target.value)
                }
              />
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={props.isBusy}
                onClick={props.onLoadProject}
              >
                Load Project
              </Button>
              {props.previewTimelineEnabled ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={props.isBusy}
                  onClick={props.onSaveTimeline}
                >
                  Save Timeline
                </Button>
              ) : null}
            </div>
          </TabsContent>
        </form>
      </Tabs>

      {activeTab === "media" ? (
        <ul className="editor-status-list">
          <li>Status: {props.status}</li>
          <li>Track asset: {props.trackAssetId || "-"}</li>
          <li>Poster asset: {props.posterAssetId || "-"}</li>
          <li>Background asset: {props.backgroundAssetId || "-"}</li>
          <li>
            Analysis:{" "}
            {props.analysisId
              ? `${props.analysisStatus} (${props.analysisId})`
              : "-"}
          </li>
          <li>Project: {props.projectId || "-"}</li>
          <li>
            Render:{" "}
            {props.renderJobId
              ? `${props.renderStatus} ${props.renderProgress}%`
              : "-"}
          </li>
          {props.previewTimelineEnabled ? (
            <>
              <li>Preview startup: {props.previewStartupMs} ms</li>
              <li>Preview drift: {props.previewDriftMs} ms</li>
              <li>Preview fps: {props.previewFps}</li>
            </>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
