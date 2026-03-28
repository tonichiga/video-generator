import { type FormEvent, useMemo, useState } from "react";

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
  visualizerType: VisualizerType;
  visualizerBarCount: number;
  posterBlurStrength: number;
  posterCornerRadius: number;
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
  onVisualizerTypeChange: (value: VisualizerType) => void;
  onVisualizerBarCountChange: (value: number) => void;
  onPosterBlurStrengthChange: (value: number) => void;
  onPosterCornerRadiusChange: (value: number) => void;
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

  const trackLabel = useMemo(() => {
    if (!trackFile) {
      return "No file selected";
    }

    return `${trackFile.name}`;
  }, [trackFile]);

  return (
    <section className="editor-panel">
      <h1>Video Generator MVP</h1>
      <p className="editor-subtitle">
        Upload track + poster, generate equalizer analysis, then save/load
        project.
      </p>

      <form className="editor-grid" onSubmit={props.onSubmitProject}>
        <label>
          Client token
          <input
            value={props.clientToken}
            onChange={(event) => props.onClientTokenChange(event.target.value)}
            required
          />
        </label>

        <label>
          Project name
          <input
            value={props.projectName}
            onChange={(event) => props.onProjectNameChange(event.target.value)}
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

        <label>
          Equalizer color
          <input
            type="color"
            value={props.equalizerColor}
            onChange={(event) =>
              props.onEqualizerColorChange(event.target.value)
            }
          />
        </label>

        <label>
          Equalizer width
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
        </label>

        <label>
          Equalizer height
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
        </label>

        <label>
          Equalizer Y
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
        </label>

        <label>
          Visualizer type
          <select
            value={props.visualizerType}
            onChange={(event) =>
              props.onVisualizerTypeChange(event.target.value as VisualizerType)
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
        </label>

        <label>
          Background blur
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
        </label>

        <label>
          Poster corner radius
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
        </label>

        <label>
          Track upload
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => setTrackFile(event.target.files?.[0] ?? null)}
          />
          <small>{trackLabel}</small>
        </label>

        <div className="editor-actions">
          <button
            type="button"
            disabled={props.isBusy || !trackFile}
            onClick={() => {
              if (trackFile) {
                props.onUploadTrack(trackFile);
              }
            }}
          >
            Upload Track
          </button>
          <button
            type="button"
            disabled={props.isBusy}
            onClick={props.onAnalyzeTrack}
          >
            Analyze
          </button>
          <button type="submit" disabled={props.isBusy}>
            Save Project
          </button>
        </div>

        <div className="editor-actions">
          <button
            type="button"
            disabled={props.isBusy}
            onClick={props.onStartRender}
          >
            Export MP4
          </button>
          <button
            type="button"
            disabled={props.isBusy || props.renderStatus !== "done"}
            onClick={props.onDownloadRender}
          >
            Download Render
          </button>
          <button
            type="button"
            disabled={
              props.isBusy ||
              (props.renderStatus !== "queued" &&
                props.renderStatus !== "processing")
            }
            onClick={props.onCancelRender}
          >
            Cancel Render
          </button>
          <button
            type="button"
            disabled={
              props.isBusy ||
              (props.renderStatus !== "failed" &&
                props.renderStatus !== "canceled")
            }
            onClick={props.onRetryRender}
          >
            Retry Render
          </button>
        </div>

        <div className="editor-actions editor-load-row">
          <input
            placeholder="project id"
            value={props.projectId}
            onChange={(event) => props.onProjectIdChange(event.target.value)}
          />
          <button
            type="button"
            disabled={props.isBusy}
            onClick={props.onLoadProject}
          >
            Load Project
          </button>
          {props.previewTimelineEnabled ? (
            <button
              type="button"
              disabled={props.isBusy}
              onClick={props.onSaveTimeline}
            >
              Save Timeline
            </button>
          ) : null}
        </div>
      </form>

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
    </section>
  );
}
