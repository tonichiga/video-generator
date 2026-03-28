# API Contracts v1

## 1. Conventions

- Base path: `/api`
- Format: JSON for metadata endpoints
- Uploads: multipart/form-data
- Auth: none (anonymous MVP)
- Project ownership: `clientToken` generated and stored client-side

## 2. Error Envelope

```json
{
  "error": {
    "code": "string",
    "message": "human readable",
    "details": {}
  }
}
```

## 3. Upload Endpoints

## 3.1 POST /api/upload/track

Upload audio track.

Request:

- multipart field: `file`

Response 201:

```json
{
  "assetId": "ast_track_123",
  "mimeType": "audio/mpeg",
  "size": 12345678,
  "durationSec": 245.32,
  "path": "uploads/tracks/ast_track_123.mp3"
}
```

## 3.2 POST /api/upload/poster

Upload poster image.

Request:

- multipart field: `file`

Response 201:

```json
{
  "assetId": "ast_poster_123",
  "mimeType": "image/png",
  "size": 812345,
  "width": 1400,
  "height": 1400,
  "path": "uploads/posters/ast_poster_123.png"
}
```

## 4. Analysis Endpoints

## 4.1 POST /api/audio/analyze

Generate audio analysis for equalizer.

Request:

```json
{
  "trackAssetId": "ast_track_123",
  "bands": 64,
  "frameStepMs": 33
}
```

Response 202:

```json
{
  "analysisId": "an_123",
  "status": "processing"
}
```

## 4.2 GET /api/audio/analyze/:analysisId

Response 200:

```json
{
  "analysisId": "an_123",
  "status": "done",
  "bands": 64,
  "frameStepMs": 33,
  "spectrumSeriesPath": "analysis/an_123_spectrum.json",
  "envelopeSeriesPath": "analysis/an_123_envelope.json"
}
```

## 4.3 GET /api/audio/analyze/:analysisId/waveform?bins=...

Get timeline-ready downsampled waveform values.

Response 200:

```json
{
  "analysisId": "an_123",
  "frameStepMs": 33,
  "durationMs": 245320,
  "values": [0.12, 0.18, 0.31]
}
```

## 5. Template Endpoints

## 5.1 GET /api/templates

Get 5-8 built-in templates.

Response 200:

```json
{
  "items": [
    {
      "id": "tpl_neon_pulse",
      "name": "Neon Pulse",
      "category": "music",
      "defaultPalette": ["#00E5FF", "#6C5CE7", "#0B0F1A"]
    }
  ]
}
```

## 6. Project Endpoints

## 6.1 POST /api/projects

Create project.

Request:

```json
{
  "clientToken": "cl_abc",
  "name": "My Mix #1",
  "format": "tiktok",
  "quality": "fhd",
  "fps": 30,
  "trackAssetId": "ast_track_123",
  "posterAssetId": "ast_poster_123",
  "analysisId": "an_123",
  "templateId": "tpl_neon_pulse",
  "particleConfig": {},
  "equalizerConfig": {},
  "posterConfig": {},
  "timeline": {
    "zoom": 1,
    "scroll": 0,
    "trimInMs": 0,
    "trimOutMs": 245320,
    "playheadMs": 0
  },
  "keyframes": [
    {
      "parameter": "equalizer.height",
      "points": [
        { "timeMs": 1000, "value": 0.12, "easing": "linear" },
        { "timeMs": 1800, "value": 0.24, "easing": "easeInOut" }
      ]
    }
  ],
  "watermarkEnabled": true
}
```

Response 201:

```json
{
  "projectId": "prj_123"
}
```

## 6.2 GET /api/projects/:projectId?clientToken=...

Response 200:

```json
{
  "projectId": "prj_123",
  "clientToken": "cl_abc",
  "name": "My Mix #1",
  "format": "tiktok",
  "quality": "fhd",
  "fps": 30,
  "trackAssetId": "ast_track_123",
  "posterAssetId": "ast_poster_123",
  "analysisId": "an_123",
  "templateId": "tpl_neon_pulse",
  "particleConfig": {},
  "equalizerConfig": {},
  "posterConfig": {},
  "timeline": {
    "zoom": 1,
    "scroll": 0,
    "trimInMs": 0,
    "trimOutMs": 245320,
    "playheadMs": 0
  },
  "keyframes": [],
  "watermarkEnabled": true,
  "updatedAt": "2026-03-28T12:00:00.000Z"
}
```

## 6.3 PATCH /api/projects/:projectId

Update project scene settings.

Request (partial):

```json
{
  "timeline": {
    "trimInMs": 1000,
    "trimOutMs": 244000,
    "playheadMs": 1000
  },
  "keyframes": [
    {
      "parameter": "equalizer.width",
      "points": [{ "timeMs": 5000, "value": 0.8, "easing": "easeInOut" }]
    }
  ],
  "equalizerConfig": {
    "x": 0.5,
    "y": 0.8,
    "width": 0.7,
    "height": 0.2,
    "color": "#FFFFFF"
  }
}
```

Response 200:

```json
{
  "projectId": "prj_123",
  "updated": true
}
```

## 7. Render Endpoints

## 7.1 POST /api/render

Start render job.

Request:

```json
{
  "projectId": "prj_123",
  "clientToken": "cl_abc"
}
```

Response 202:

```json
{
  "renderJobId": "job_123",
  "status": "queued"
}
```

## 7.2 GET /api/render/:renderJobId/status

Response 200:

```json
{
  "renderJobId": "job_123",
  "status": "processing",
  "progress": 42,
  "watermarkApplied": true,
  "error": null
}
```

## 7.3 GET /api/render/:renderJobId/download

Response:

- 200 file stream (`video/mp4`) when done
- 409 if not finished

## 8. Validation Rules (MVP)

- Reject unsupported MIME types.
- Reject corrupted or unreadable media.
- Force fps = 30.
- Restrict format/quality combinations to supported profiles.
- Enforce layering invariant in server-side render graph.
- timeline: `0 <= trimInMs < trimOutMs <= trackDurationMs`
- keyframes v1:
  - allowed parameters: `equalizer.width`, `equalizer.height`, `equalizer.y`
  - each keyframe `timeMs` must be within active timeline trim range
  - `value` must satisfy parameter ranges from server validation

## 10. Preview Runtime Endpoints

## 10.1 GET /api/system/features

Expose feature flags used by frontend gating.

Response 200:

```json
{
  "flags": {
    "preview_timeline_v1": true
  }
}
```

## 10.2 GET /api/assets/:assetId

Stream track/poster/render asset by id for browser preview and utility access.

Response:

- 200 binary stream with source mime type
- 404 when asset or asset file is missing

## 10.3 POST /api/system/preview-metrics

Accept preview telemetry events (`preview_startup`, `preview_runtime`, etc.).

Request:

```json
{
  "event": "preview_runtime",
  "projectId": "prj_123",
  "analysisId": "an_123",
  "timestamp": "2026-03-28T12:00:00.000Z",
  "fps": 30,
  "driftMs": 18
}
```

Response 202:

```json
{
  "ok": true
}
```

## 9. Migration Notes for Serverless + Supabase

- Keep endpoint shapes stable.
- Replace local `path` fields with storage keys or signed URLs.
- Render job status contract remains unchanged.
