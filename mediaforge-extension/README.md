# MediaForge Downloader

A Manifest V3 Chrome extension that detects video and audio loaded by the current page and downloads it. It handles direct files and HLS and DASH streams, includes a download manager, and does all its work locally.

> **Scope.** MediaForge works only with media the browser can already fetch. It **does not** decrypt DRM-protected or encrypted media. It also does not bypass access controls, geo-restrictions, VPN or firewall rules, anti-bot systems, or server refusals. When a server refuses access, MediaForge reports the error and doesn't try to work around it. These limits are deliberate and are not bugs.

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Development](#development)
- [Architecture](#architecture)
- [Permissions](#permissions)
- [Privacy model](#privacy-model)
- [Security model](#security-model)
- [Supported media](#supported-media)
- [Limitations](#limitations)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Extending](#extending)

## Features

- **Multi-layer detection.** MediaForge watches DOM `<video>`, `<audio>`, `<source>` and media links, with a MutationObserver for elements added later. It also listens for capture-phase media events and reads Resource Timing entries. A page-level hook observes `fetch()`/XHR responses, `URL.createObjectURL`, `history.pushState` and EME usage. The service worker additionally reads response headers through `chrome.webRequest`.
- **Deduplication.** URLs are normalized: the scheme is ignored, the host is lower-cased and the fragment removed, tracking parameters are stripped, signing, expiry and byte-range parameters are ignored, and the remaining query is sorted. The same file seen by several detectors therefore appears once. Different paths or meaningful parameters are never merged.
- **HLS.** MediaForge parses master and media playlists, including variants with resolution, bandwidth, codecs and frame rate, and audio renditions. It supports `EXT-X-MAP` init segments, `EXT-X-BYTERANGE`, VOD and live playlists, and detects encryption and DRM. MPEG-TS and fragmented-MP4 segments are downloaded with limited concurrency and joined in order.
- **DASH.** Parses `Period` / `AdaptationSet` / `Representation`, `SegmentTemplate` (`$Number$`, `$Time$`, `%0Nd`), `SegmentTimeline` (including `r=-1`), `SegmentList`, `SegmentBase`, hierarchical `BaseURL`, and `ContentProtection`. Video and audio are downloaded as separate tracks.
- **Quality selection.** Auto, Highest, a specific resolution (1080p, 720p, …) or Audio only. If the exact quality is missing, it picks the best one below it, and otherwise the lowest one above. Labels are normalized to 2160p, 1440p, 1080p, 720p, 480p, 360p and 240p, including for letterboxed and portrait video. When no information is available, the label is "Unknown quality". Values are never guessed.
- **Download manager.** Shows active, queued, paused, completed and failed downloads. You can pause, resume, retry, cancel or remove each one, and see progress, speed and ETA. Transient errors are retried with exponential backoff (1 s, 2 s, 4 s, 8 s …) up to a limit you configure.
- **Smart filenames.** Names follow the pattern `Example Documentary - 1080p.mp4`, built from the media title, page title or URL filename. Site-name suffixes are removed. Query strings, which may hold tokens, never appear in names. Names are made safe for Windows, macOS and Linux, and duplicate names within a session get a number.
- **Download button on the video.** A small ⬇ Download pill sits on the top-right corner of the largest visible video. It opens a quality menu, for example 1080p / 720p / Audio only, with each option's size: exact for files, ≈ estimated from bitrate × duration for streams. It only appears when that page has downloadable video, and you can turn it off in Settings or hide it for the current page.
- **Popup.** Lists what was found on the current page, with the stream qualities available for each item. It has Download, Download All, Scan Again and Open Download Manager buttons, and dark, light and system themes.
- **Floating page panel (optional).** Lives in a closed Shadow DOM and can be minimized, closed, or turned off for a site.
- **Context menus.** "Download video with MediaForge", "Download audio with MediaForge", "Download media with MediaForge" (on media links only) and "Scan page for media".
- **SPA aware.** Handles `pushState`, `replaceState`, `popstate` and `hashchange`. On navigation it drops media from the previous view and rescans once, without polling.

## Installation

Requirements: Node.js 20+ and Google Chrome 116+.

```bash
cd mediaforge-extension
npm install
npm run build        # production build → dist/
```

Load it into Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select `mediaforge-extension/dist`.
4. Pin MediaForge from the puzzle-piece menu.

Pages that were already open before installation need a reload so the content scripts can run there.

## Development

| Command | What it does |
| --- | --- |
| `npm run build` | Minified production build into `dist/` |
| `npm run build:dev` | Unminified build with source maps |
| `npm run watch` | Rebuild on change (reload the extension in `chrome://extensions` afterwards) |
| `npm run typecheck` | `tsc --noEmit` under strict settings (`strict`, `noUncheckedIndexedAccess`, …) |
| `npm test` | Unit tests (Vitest) |
| `npm run verify` | Validates `dist/`: MV3 structure, referenced files, permission allow-list, CSP, icons, and no `eval`, remote code or HTML-string injection |
| `npm run check` | Runs typecheck, tests, build and verify |
| `npm run e2e` | Optional Chromium smoke test (see [Testing](#testing)) |

The icons are drawn in code (`scripts/icons.mjs`) during the build, so the repository contains no binary assets.

## Architecture

```
┌──────────────────────── web page (every frame) ─────────────────────────┐
│  MAIN world: content/page-hook.ts                                       │
│    observes fetch/XHR response URL + Content-Type, createObjectURL,     │
│    pushState/replaceState, requestMediaKeySystemAccess                  │
│               │ window.postMessage (validated: content/hook-protocol)   │
│  ISOLATED world: content/index.ts                                       │
│    PageObserver (MutationObserver, media events, PerformanceObserver,   │
│    SPA URL checks) → dom-detector → batched MEDIA_CANDIDATES            │
│    FloatingPanel (closed shadow root)                                   │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ chrome.runtime messages (sender-checked)
┌───────────────▼──────────── service worker: background/ ─────────────────┐
│  network-observer (webRequest.onHeadersReceived, response headers only)  │
│  TabStateStore → detector/collection (normalize + dedup, per tab,        │
│                  mirrored to chrome.storage.session)                     │
│  StreamAnalyzer → detector/manifest (hls.ts, dash.ts, xml.ts, analyze.ts)│
│  DownloadService → download/queue (concurrency, retry, backoff)          │
│     executors: Direct (chrome.downloads) · Blob (page saves its blob)    │
│                Stream ─────────────┐                                     │
│  context menus, badge, notifications                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │ STREAM_START / PROGRESS / DONE
┌────────────────────────────────────▼─── offscreen document ──────────────┐
│  segment-fetcher (bounded concurrency, per-segment retry, Range support, │
│  HTML-error sniffing) → processor (assemble; optional muxer hook)        │
│  → blob: URL → background saves with chrome.downloads                    │
└──────────────────────────────────────────────────────────────────────────┘
      popup/ · manager/ · options/  ⇄  background (request/response + live port)
```

### Source layout

```
src/
  background/   service worker: tab state, network observer, analyzer, download service, executors, context menus
  content/      MAIN-world hook, isolated content script, DOM detector, PageObserver, floating panel
  detector/     collection.ts (normalization + dedup) and manifest/ (HLS, DASH, XML, analysis + planning)
  download/     queue, retry/backoff, segment fetcher, pause gate, container sniffing, processor hook
  offscreen/    stream assembly document
  popup/        toolbar popup
  manager/      download manager page
  options/      settings page
  storage/      settings schema, validation, persistence
  ui/           shared UI API, labels, base stylesheet (design tokens, dark/light)
  utils/        URL, MIME, quality, filename, format, errors, logger, DOM builder, timing
  types/        strongly typed domain model and message protocol
tests/          unit tests + fixtures (MP4/WebM headers, HLS master/media, MPDs, invalid manifests)
e2e/            optional Chromium smoke test + fixture site
scripts/        build, icon renderer, manifest verifier
```

### Design notes

- **Separation.** Detection (`content/`, `background/network-observer.ts`), analysis (`detector/manifest`), representation (`types`, `detector/collection.ts`), download management (`download/`, `background/downloads.ts`), UI (`popup/`, `manager/`, `options/`), persistence (`storage/`) and logging (`utils/logger.ts`) are separate modules. The queue, parsers, planner and segment fetcher contain no Chrome code and are unit-tested directly.
- **Service-worker lifecycle.** All listeners are registered at the top level. Tab state and the download list are kept in `chrome.storage.session`. A download that was running when the worker stopped is picked up again on restart: direct downloads reattach to Chrome's download item, and stream jobs reconnect to the offscreen document. Stream plans are not persisted; they are rebuilt when needed.
- **Manifests are analyzed lazily.** They are fetched only when the popup is opened or a download starts, and the results are cached. For an HLS master playlist, MediaForge also reads one media playlist to check for encryption.
- **Why an offscreen document?** An MV3 service worker cannot create `blob:` URLs. Segments are therefore assembled in an offscreen document with the `BLOBS` reason, which is closed again when it is idle.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Settings go in `sync`. Per-tab media lists and the download list go in `session`, which is memory-only. |
| `downloads` | Saving files, pause, resume and cancel, and "Show in folder". |
| `webRequest` | Seeing media responses that scripts cannot see, using response `Content-Type`, `Content-Length` and `Content-Range` only. The listener is non-blocking and never modifies requests (`webRequestBlocking` is not requested). |
| `contextMenus` | The right-click entries. |
| `offscreen` | Assembling HLS and DASH segments into a file (see above). |
| `notifications` | Completion and failure notices. They can be turned off in Settings. |
| Host access `http://*/*`, `https://*/*` | Detection has to work on any site. It is needed for the content scripts, for `webRequest` visibility, and for fetching manifests and segments that the page itself loads. |

MediaForge deliberately does **not** request `tabs`, `scripting`, `cookies`, `history`, `webNavigation`, `declarativeNetRequest`, `debugger` or `<all_urls>`. `npm run verify` fails the build if any of these appear.

## Privacy model

- **Everything stays local.** MediaForge has no server, analytics, telemetry or remote configuration, and it loads no remote code (enforced by the CSP and by `verify`).
- **No credentials are handled.** Request headers are never read or stored, and neither are cookies, `Authorization` headers, tokens or passwords. Manifest and segment requests go through Chrome's normal network stack, which attaches whatever it normally would. MediaForge never sees or copies those values, and it never adds or forges headers such as `Referer`.
- **Minimal data.** For each tab, MediaForge keeps only media URLs and basic metadata (title, size, resolution). This lives in session storage, is cleared when the browser closes or the tab is closed, and content scripts cannot read it. The download list also lives in session storage. Settings, including the excluded-sites list, sync through your Chrome profile.
- **Logs are redacted and optional.** The debug log is in memory only, turned off by default, capped at 300 entries, and has query strings removed from every URL.
- **You can exclude sites.** Excluded sites are neither scanned nor observed.

## Security model

- **Discovered data is untrusted.** Only `http(s)` URLs, plus `blob:` URLs with an `http(s)` origin, are accepted. `javascript:`, `data:`, `file:` and `chrome:` URLs are rejected. Posters must be `http(s)` or `data:image` raster images; SVG is not accepted.
- **No HTML injection.** All UI is built with a small DOM helper that uses `textContent` and a list of allowed attributes. `innerHTML` is never used (`verify` checks the bundles for this). Extension pages run under a strict CSP: `script-src 'self'; object-src 'self'; base-uri 'none'; form-action 'none'`.
- **Filenames are sanitized.** Characters `/ \ : * ? " < > |`, control characters and bidi-override characters are stripped. Leading dots and `..` are removed, Windows device names such as `CON` and `LPT1` are escaped, and names are truncated without breaking UTF-16 surrogate pairs. The download folder must be a relative path and cannot use `..`. Chrome's `conflictAction: "uniquify"` provides a second layer of protection.
- **Messages are checked.** The background accepts UI messages only from extension pages and page-related messages only from content scripts, and uses the tab ID reported by Chrome for them. Hook messages sent with `postMessage` can be forged by the page, so they are validated against a schema and treated as untrusted input.
- **Parsers are defensive.** The XML parser does not process DTDs or external entities and limits size, depth and element count. Playlists are limited to 100k segments, and a stream download is limited to 4 GiB in total.
- **Error pages are caught.** If a server returns HTML with status 200 instead of media, the download fails with an error rather than saving a corrupt file.

## Supported media

| Kind | Formats | Download method |
| --- | --- | --- |
| Direct video | MP4, WebM, MOV, M4V, OGV | `chrome.downloads` (resumable, handled by Chrome) |
| Direct audio | MP3, AAC, M4A, WAV, FLAC, OGG/OGA, Opus | `chrome.downloads` |
| HLS (`.m3u8`) | MPEG-TS or fMP4 segments, byte-range playlists, separate audio renditions | Segments are joined into `.ts` (TS) or `.mp4`/`.m4a` (fMP4) |
| DASH (`.mpd`) | fMP4/WebM with `SegmentTemplate`/`SegmentTimeline`/`SegmentList`/`SegmentBase` | Video and audio saved as separate files, e.g. `Title - 720p (video).mp4` and `Title - 720p (audio).m4a` |
| Blob media | `URL.createObjectURL(Blob)` with a `video/*` or `audio/*` type | The page saves its own blob with an `<a download>` |
| Protected | HLS `AES-128`, `SAMPLE-AES`, FairPlay, Widevine, PlayReady; DASH `ContentProtection` | **Not supported.** Shown as "Protected media — downloading is not supported." |

## Limitations

- **DRM and encryption are out of scope by design.** This includes HLS streams encrypted with AES-128 even when the key URL is reachable.
- **Live streams** (HLS without `EXT-X-ENDLIST`, dynamic DASH) are detected but not downloaded.
- **Media Source players.** Players that feed `MediaSource` from a manifest can be downloaded through that manifest. Players that build the stream from a custom protocol with no manifest or file URL cannot be reconstructed, and MediaForge says so.
- **Some files are not merged or remuxed.** Separate DASH or HLS audio and video tracks are saved as two files, and HLS MPEG-TS is saved as `.ts`, which VLC, mpv and most editors play. Merging and remuxing need a bundled muxer; the hook for one is described under [Extending](#extending).
- **Stream memory.** Streams are assembled in memory as Blobs, which Chrome may page to disk. The cap is 4 GiB per download.
- **Server checks.** Some CDNs require a page `Referer` or origin-bound cookies. Chrome may not send these on extension requests, and in that case the download fails with "Media URL could not be accessed." MediaForge does not forge headers.
- **Restricted pages.** Content scripts do not run on `chrome://` pages, the Chrome Web Store, or other extensions' pages.
- **Small files are ignored.** Files under 64 KB, such as a site's interface sound effects and tracking beacons, are not listed. Manifests are always kept.
- **YouTube and similar platforms** deliver video through their own player with protected, signed stream URLs rather than downloadable files or standard manifests. MediaForge does not defeat those protections, so it offers nothing to download there.
- **Auto-download.** It is off by default. When turned on, it only handles complete direct files of 100 KB or more, and at most 5 per page.

## Testing

```bash
npm test          # unit tests
npm run check     # typecheck + tests + build + manifest verification
```

The unit tests cover:

- URL normalization and scheme safety
- Filename sanitization and generation
- Media type detection and segment detection
- Container sniffing, using MP4, WebM, TS, MP3 and HTML-error mocks
- Quality labels and variant selection
- M3U8 parsing: master, media, fMP4 plus byte-range, live, AES-128, FairPlay, Widevine, and invalid input
- MPD parsing: template, timeline, list, base, DRM, live, and invalid input
- Manifest analysis and download planning with a mocked fetcher
- Deduplication, merging and SPA clearing
- The download queue: concurrency, pause and resume, cancellation, manual retry, restore
- Retry and backoff behaviour and error mapping, including network failures
- The segment downloader: ordering, concurrency, retries, 403, HTML error bodies, size cap, cancel, pause
- Settings storage and validation
- The DOM detector (jsdom), the network observer, and hook-message validation

**End-to-end smoke test (optional).** It loads `dist/` into Chromium and runs 36 checks against a local fixture site. The checks cover detection, HLS, DASH and DRM analysis, real direct and stream downloads, 403 handling, the popup, manager and options pages, the floating panel, the on-video Download button, filtering of tiny interface sounds, SPA navigation, and excluded sites.

```bash
npm i -D playwright && npx playwright install chromium
npm run build && npm run e2e            # SHOTS=./shots npm run e2e to save screenshots
```

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| "No downloadable media detected on this page." | Start playback first, since many players load media only on play, then click **Scan Again**. Reload the page if it was open before MediaForge was installed. Check that the site isn't in **Settings → Sites excluded from scanning** and that **Auto-detect** is on. |
| "Reload the page so MediaForge can scan it." | The tab was opened before the extension was installed or updated. Reload it. |
| "Protected media — downloading is not supported." | The stream uses DRM or encryption. This is intentional. |
| "Media URL could not be accessed." / "Server rejected the download." | The server refused the request (403/401/5xx), for example because of an expired signed URL, a check on `Referer` or origin, or a geographic restriction. Replay the video and try again straight away. MediaForge won't bypass the refusal. |
| "Manifest could not be parsed." | The playlist is malformed or not actually HLS or DASH. Turn on debug logging for details. |
| "Network connection interrupted." | Retried automatically. If it still fails, use **Retry** in the download manager. |
| "Insufficient storage." | Free up disk space or change the Chrome download location. |
| A DASH download produced two files | This is expected: video and audio are separate tracks (see Limitations). |
| Need technical details | Turn on **Settings → Enable debug logging**. Error details then appear in the manager and popup, and a log viewer appears in Settings. |

To inspect the service worker, open `chrome://extensions` → MediaForge → **Service worker**. For the offscreen document, go to `chrome://extensions` → MediaForge → **Inspect views: offscreen.html** while a stream download is running.

## Extending

- **Merging and remuxing with WASM.** Implement `MediaProcessor` (`src/download/processor.ts`) with a muxer bundled inside the extension package, such as an ffmpeg.wasm or mp4box.js build; remote code is not allowed in MV3. Then call `registerMediaProcessor()` in `src/offscreen/main.ts`. When `canMerge()` returns true, `finalizeTracks()` passes all tracks to it and a single file is saved. Processors run locally in the offscreen document and must never decrypt anything.
- **Firefox/Edge.** Edge runs the Chrome build as-is. For Firefox, replace the offscreen document with a background page, which can create `blob:` URLs, map `chrome.*` to `browser.*`, and adjust the `world: "MAIN"` content script, which needs Firefox 128+. All the Chrome-specific code sits in `src/background/*`, `src/content/index.ts` and `src/offscreen/`.
