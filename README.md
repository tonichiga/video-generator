This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Project Documentation

- PRD + Tech Spec v1: `docs/PRD-TECHSPEC-v1.md`
- API Contracts v1: `docs/api/contracts-v1.md`
- Delivery Backlog (Sprint 1-2): `docs/planning/backlog-sprint-1-2.md`
- Implementation Plan (Realtime Preview + Timeline v1): `docs/planning/implementation-plan-realtime-preview-timeline-v1.md`
- Technical Doc (Realtime Preview + Timeline v1): `docs/technical/TECHSPEC-realtime-preview-timeline-v1.md`
- Prompt for Senior Fullstack Skill (Realtime Preview + Timeline v1): `docs/planning/prompt-senior-fullstack-realtime-preview-timeline-v1.md`
- Developer Start Handoff: `docs/DEVELOPER-START-HANDOFF.md`

## Render Watermark Env Config

- `RENDER_WATERMARK_ENABLED=true|false`: global switch for watermark overlay in final render.
- `RENDER_WATERMARK_TEXT="Your text"`: watermark label text.
- `RENDER_WATERMARK_FONT_SIZE=16`: watermark label font size in px (range `10..72`).

Backward compatibility:

- `WATERMARK_ENABLED` is still supported as a legacy fallback when `RENDER_WATERMARK_ENABLED` is not set.
