import { type DragEvent, type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  cameraPunchStrength: number;
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
  onCameraPunchStrengthChange: (value: number) => void;
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
  const bannerBorderColorControl = parseColorForControl(
    props.bannerBorderColor,
  );
  const trackTextColorControl = parseColorForControl(props.trackTextColor);

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
              <select
                value={props.format}
                onChange={(event) =>
                  props.onFormatChange(event.target.value as Format)
                }
              >
                <option value="tiktok">TikTok 9:16</option>
                <option value="youtube">YouTube 16:9</option>
              </select>
            </label>

            <label>
              Quality
              <select
                value={props.quality}
                onChange={(event) =>
                  props.onQualityChange(event.target.value as Quality)
                }
              >
                <option value="hd">HD</option>
                <option value="fhd">FHD</option>
              </select>
            </label>

            <label>
              Template
              <select
                value={props.selectedTemplateId ?? ""}
                onChange={(event) =>
                  props.onTemplateChange(event.target.value || null)
                }
              >
                {props.templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </label>
          </TabsContent>

          <TabsContent value="visual" className="editor-tab-content">
            <label>
              Equalizer color
              <div className="editor-range-row">
                <input
                  type="color"
                  value={equalizerColorControl.hex}
                  onChange={(event) =>
                    props.onEqualizerColorChange(
                      toRgbaFromHex(
                        event.target.value,
                        equalizerColorControl.alpha,
                      ),
                    )
                  }
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={equalizerColorControl.alpha}
                  onChange={(event) =>
                    props.onEqualizerColorChange(
                      toRgbaFromHex(
                        equalizerColorControl.hex,
                        Number(event.target.value),
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={equalizerColorControl.alpha}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 1);
                    if (next !== null) {
                      props.onEqualizerColorChange(
                        toRgbaFromHex(equalizerColorControl.hex, next),
                      );
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Equalizer width
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={props.equalizerWidth}
                  onChange={(event) =>
                    props.onEqualizerWidthChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={props.equalizerWidth}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0.1, 1);
                    if (next !== null) {
                      props.onEqualizerWidthChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Equalizer height
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0.05}
                  max={0.4}
                  step={0.01}
                  value={props.equalizerHeight}
                  onChange={(event) =>
                    props.onEqualizerHeightChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={0.05}
                  max={0.4}
                  step={0.01}
                  value={props.equalizerHeight}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0.05, 0.4);
                    if (next !== null) {
                      props.onEqualizerHeightChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Equalizer Y
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.equalizerY}
                  onChange={(event) =>
                    props.onEqualizerYChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.equalizerY}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 1);
                    if (next !== null) {
                      props.onEqualizerYChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Spectrum glow ({props.equalizerGlowStrength.toFixed(2)}x)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={0.01}
                  value={props.equalizerGlowStrength}
                  onChange={(event) =>
                    props.onEqualizerGlowStrengthChange(
                      Number(event.target.value),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={6}
                  step={0.01}
                  value={props.equalizerGlowStrength}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 6);
                    if (next !== null) {
                      props.onEqualizerGlowStrengthChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Glow color
              <div className="editor-range-row">
                <input
                  type="color"
                  value={glowColorControl.hex}
                  onChange={(event) =>
                    props.onEqualizerGlowColorChange(
                      toRgbaFromHex(event.target.value, glowColorControl.alpha),
                    )
                  }
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={glowColorControl.alpha}
                  onChange={(event) =>
                    props.onEqualizerGlowColorChange(
                      toRgbaFromHex(
                        glowColorControl.hex,
                        Number(event.target.value),
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={glowColorControl.alpha}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 1);
                    if (next !== null) {
                      props.onEqualizerGlowColorChange(
                        toRgbaFromHex(glowColorControl.hex, next),
                      );
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Glow spread ({props.equalizerGlowSpread.toFixed(2)}x)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.01}
                  value={props.equalizerGlowSpread}
                  onChange={(event) =>
                    props.onEqualizerGlowSpreadChange(
                      Number(event.target.value),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={4}
                  step={0.01}
                  value={props.equalizerGlowSpread}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 4);
                    if (next !== null) {
                      props.onEqualizerGlowSpreadChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Visualizer type
              <select
                value={props.visualizerType}
                onChange={(event) =>
                  props.onVisualizerTypeChange(
                    event.target.value as VisualizerType,
                  )
                }
              >
                {VISUALIZER_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Visualizer bar count ({props.visualizerBarCount})
              <div className="editor-range-row">
                <input
                  type="range"
                  min={8}
                  max={96}
                  step={1}
                  value={props.visualizerBarCount}
                  onChange={(event) =>
                    props.onVisualizerBarCountChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={8}
                  max={96}
                  step={1}
                  value={props.visualizerBarCount}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 8, 96);
                    if (next !== null) {
                      props.onVisualizerBarCountChange(Math.round(next));
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Background blur
              <div className="editor-range-row">
                <input
                  type="range"
                  min={8}
                  max={36}
                  step={1}
                  value={props.posterBlurStrength}
                  onChange={(event) =>
                    props.onPosterBlurStrengthChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={8}
                  max={36}
                  step={1}
                  value={props.posterBlurStrength}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 8, 36);
                    if (next !== null) {
                      props.onPosterBlurStrengthChange(Math.round(next));
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Background dim ({Math.round(props.backgroundDimStrength * 100)}%)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.01}
                  value={props.backgroundDimStrength}
                  onChange={(event) =>
                    props.onBackgroundDimStrengthChange(
                      Number(event.target.value),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={0.85}
                  step={0.01}
                  value={props.backgroundDimStrength}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 0.85);
                    if (next !== null) {
                      props.onBackgroundDimStrengthChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Banner size ({Math.round(props.bannerScale * 100)}%)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0.2}
                  max={0.8}
                  step={0.01}
                  value={props.bannerScale}
                  onChange={(event) =>
                    props.onBannerScaleChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={0.2}
                  max={0.8}
                  step={0.01}
                  value={props.bannerScale}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0.2, 0.8);
                    if (next !== null) {
                      props.onBannerScaleChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Banner border
              <div className="editor-range-row">
                <select
                  value={props.bannerBorderEnabled ? "on" : "off"}
                  onChange={(event) =>
                    props.onBannerBorderEnabledChange(
                      event.target.value === "on",
                    )
                  }
                >
                  <option value="on">Enabled</option>
                  <option value="off">Disabled</option>
                </select>
                <input
                  type="color"
                  value={bannerBorderColorControl.hex}
                  onChange={(event) =>
                    props.onBannerBorderColorChange(
                      toRgbaFromHex(
                        event.target.value,
                        bannerBorderColorControl.alpha,
                      ),
                    )
                  }
                  disabled={!props.bannerBorderEnabled}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={bannerBorderColorControl.alpha}
                  onChange={(event) =>
                    props.onBannerBorderColorChange(
                      toRgbaFromHex(
                        bannerBorderColorControl.hex,
                        Number(event.target.value),
                      ),
                    )
                  }
                  disabled={!props.bannerBorderEnabled}
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={bannerBorderColorControl.alpha}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 1);
                    if (next !== null) {
                      props.onBannerBorderColorChange(
                        toRgbaFromHex(bannerBorderColorControl.hex, next),
                      );
                    }
                  }}
                  disabled={!props.bannerBorderEnabled}
                />
              </div>
            </label>

            <label>
              Banner border width
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={props.bannerBorderWidth}
                  onChange={(event) =>
                    props.onBannerBorderWidthChange(Number(event.target.value))
                  }
                  disabled={!props.bannerBorderEnabled}
                />
                <input
                  type="number"
                  min={0}
                  max={12}
                  step={1}
                  value={props.bannerBorderWidth}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 12);
                    if (next !== null) {
                      props.onBannerBorderWidthChange(Math.round(next));
                    }
                  }}
                  disabled={!props.bannerBorderEnabled}
                />
              </div>
            </label>

            <label>
              Poster corner radius
              <div className="editor-range-row">
                <input
                  type="range"
                  min={6}
                  max={40}
                  step={1}
                  value={props.posterCornerRadius}
                  onChange={(event) =>
                    props.onPosterCornerRadiusChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={6}
                  max={40}
                  step={1}
                  value={props.posterCornerRadius}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 6, 40);
                    if (next !== null) {
                      props.onPosterCornerRadiusChange(Math.round(next));
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Beat scale strength ({props.posterBeatScaleStrength.toFixed(2)}x)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.05}
                  value={props.posterBeatScaleStrength}
                  onChange={(event) =>
                    props.onPosterBeatScaleStrengthChange(
                      Number(event.target.value),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.05}
                  value={props.posterBeatScaleStrength}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 5);
                    if (next !== null) {
                      props.onPosterBeatScaleStrengthChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Camera punch ({props.cameraPunchStrength.toFixed(2)}x)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={props.cameraPunchStrength}
                  onChange={(event) =>
                    props.onCameraPunchStrengthChange(
                      Number(event.target.value),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={3}
                  step={0.05}
                  value={props.cameraPunchStrength}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 3);
                    if (next !== null) {
                      props.onCameraPunchStrengthChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Parallax drift ({props.parallaxDriftStrength.toFixed(2)}x)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={props.parallaxDriftStrength}
                  onChange={(event) =>
                    props.onParallaxDriftStrengthChange(
                      Number(event.target.value),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={3}
                  step={0.05}
                  value={props.parallaxDriftStrength}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 3);
                    if (next !== null) {
                      props.onParallaxDriftStrengthChange(next);
                    }
                  }}
                />
              </div>
            </label>
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
              Text color
              <div className="editor-range-row">
                <input
                  type="color"
                  value={trackTextColorControl.hex}
                  onChange={(event) =>
                    props.onTrackTextColorChange(
                      toRgbaFromHex(
                        event.target.value,
                        trackTextColorControl.alpha,
                      ),
                    )
                  }
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={trackTextColorControl.alpha}
                  onChange={(event) =>
                    props.onTrackTextColorChange(
                      toRgbaFromHex(
                        trackTextColorControl.hex,
                        Number(event.target.value),
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={trackTextColorControl.alpha}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 1);
                    if (next !== null) {
                      props.onTrackTextColorChange(
                        toRgbaFromHex(trackTextColorControl.hex, next),
                      );
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Text align
              <select
                value={props.trackTextAlign}
                onChange={(event) =>
                  props.onTrackTextAlignChange(
                    event.target.value as "left" | "center" | "right",
                  )
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>

            <label>
              Text X ({props.trackTextX.toFixed(2)})
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.trackTextX}
                  onChange={(event) =>
                    props.onTrackTextXChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.trackTextX}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 1);
                    if (next !== null) {
                      props.onTrackTextXChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Text Y ({props.trackTextY.toFixed(2)})
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.trackTextY}
                  onChange={(event) =>
                    props.onTrackTextYChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.trackTextY}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 1);
                    if (next !== null) {
                      props.onTrackTextYChange(next);
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Text size ({Math.round(props.trackTextSize)} px)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={14}
                  max={120}
                  step={1}
                  value={props.trackTextSize}
                  onChange={(event) =>
                    props.onTrackTextSizeChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={14}
                  max={120}
                  step={1}
                  value={props.trackTextSize}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 14, 120);
                    if (next !== null) {
                      props.onTrackTextSizeChange(Math.round(next));
                    }
                  }}
                />
              </div>
            </label>

            <label>
              Text gap ({Math.round(props.trackTextGap)} px)
              <div className="editor-range-row">
                <input
                  type="range"
                  min={0}
                  max={120}
                  step={1}
                  value={props.trackTextGap}
                  onChange={(event) =>
                    props.onTrackTextGapChange(Number(event.target.value))
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={props.trackTextGap}
                  onChange={(event) => {
                    const next = toClampedNumber(event.target.value, 0, 120);
                    if (next !== null) {
                      props.onTrackTextGapChange(Math.round(next));
                    }
                  }}
                />
              </div>
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
