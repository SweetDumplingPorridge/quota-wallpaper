# Quota Wallpaper Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task in this session. Source must be retained.

**Goal:** Deliver a publishable Web wallpaper with optional local collection and honest multi-account statistics.

**Architecture:** Shared pure accounting functions feed the browser and collector. Provider adapters output sanitized accounts; bounded history stores snapshots and token events. A bundled frontend reads Web API keys, loopback data or local snapshot files.

**Tech Stack:** JavaScript ESM, Node >=20, yaml, esbuild, Node test runner, Playwright against installed Chrome.

**Spec:** ../specs/2026-10-12-quota-wallpaper-design.md

## Global Constraints

- Never release private credentials, local account data or connection tokens.
- Never combine currencies, quota windows or bucket categories.
- Missing data stays missing; percentage sums are labeled unweighted.
- Frontend rendering remains static between updates.

## Task 1: Accounting and coverage

Files: src/core.js, tests/core.test.js. Interfaces: normalizeCodex(raw, metadata, now), mergeAccounts(accounts), aggregate(accounts), chartSeries(history, events, options), publicConfig(config).

- [x] Write tests that unknown windows remain absent, expiry cannot imply reset, duplicate account keys do not duplicate money, and distinct currencies/windows remain separate.
- [x] Run `npm test` and inspect expected missing-export failures.
- [x] Implement normalization, grouping, rolling bounds, reset/gap-aware statistics and secret-free settings projection.
- [x] Run `npm test`; require all accounting fixtures to pass.

## Task 2: Local collection and transport

Files: collector/providers.js, collector/tokens.js, collector/store.js, collector/server.js, collector/main.js; tests/collector.test.js.

- [x] Write fixtures for token log increments, UTF-8 split boundaries, repeated cumulative counts, incomplete lines, configured account metadata and capability authentication.
- [x] Verify tests fail before adapter implementation.
- [x] Implement read-only DSH/API/Codex adapters, isolated app-server stdio lifecycle, state storage, command-line one-shot/serve modes and authenticated management routes.
- [x] Run tests and one real collection into ignored artifacts; inspect sanitized provider statuses.

## Task 3: Responsive wallpaper and settings

Files: src/ui.js, src/charts.js, wallpaper/index.html, wallpaper/styles.css, wallpaper/project.json, scripts/build.js; tests/browser.js.

- [x] Add browser checks for initial state, demo mode, responsive bounds, persisted settings, key entry, account selection and metric/window controls.
- [x] Verify browser checks fail before UI implementation.
- [x] Implement all settings, layered charts, accessible controls, XHR local files, polling, cache, demo data and live bridge integration.
- [x] Build and run browser checks at portrait, 1080p, 2K, 4K and ultrawide sizes. Capture screenshots.

## Task 4: Publishable distribution

Files: README.md, LICENSE, docs/PUBLISHING.md, docs/DATA.md, scripts/package.js, scripts/preview.js, scripts/windows/*.ps1, .github/workflows/ci.yml.

- [x] Build explicit allowlisted wallpaper and source distributions, with demo data only.
- [x] Verify zip manifests and scan outputs for private file names and credential patterns.
- [x] Run complete tests, live collection, build, browser checks and packaging.
- [x] Initialize local Git repository on development branch and retain source; do not publish remotely.
