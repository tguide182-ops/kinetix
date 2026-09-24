/**
 * Offscreen document: downloads HLS/DASH segments and assembles them into
 * blobs that the background saves with chrome.downloads. Runs only while a
 * stream download is in progress. Never decrypts anything — plans for
 * protected streams are refused before they get here.
 */
import { PauseGate } from '../download/pause-gate';
import { assembleTrack, finalizeTracks, type AssembledTrack } from '../download/processor';
import { downloadSegments, fetchSegment, MAX_STREAM_BYTES } from '../download/segment-fetcher';
import { withRetry } from '../download/retry';
import type { BackgroundToOffscreen, OffscreenToBackground, StreamPlan, StreamTrackOutput } from '../types';
import { toMediaForgeError } from '../utils/errors';

interface Job {
  controller: AbortController;
  gate: PauseGate;
}

const jobs = new Map<string, Job>();
const blobUrls = new Set<string>();

function post(msg: OffscreenToBackground): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* background restarting; it will re-request if needed */
  });
}

async function runJob(jobId: string, plan: StreamPlan, concurrency: number, maxRetries: number): Promise<void> {
  const job: Job = { controller: new AbortController(), gate: new PauseGate() };
  jobs.set(jobId, job);
  const { signal } = job.controller;
  const segmentsTotal = plan.tracks.reduce((s, t) => s + t.segments.length + (t.init ? 1 : 0), 0);
  const estimated = plan.tracks.every((t) => t.estimatedBytes) ? plan.tracks.reduce((s, t) => s + (t.estimatedBytes ?? 0), 0) : undefined;
  let bytesBefore = 0;
  let segsBefore = 0;
  let lastPost = 0;

  try {
    const assembled: AssembledTrack[] = [];
    for (const track of plan.tracks) {
      let init: Blob | undefined;
      if (track.init) {
        const bytes = await withRetry(() => fetchSegment(track.init!, (u, i) => fetch(u, i), signal), { maxRetries, signal });
        init = new Blob([bytes]);
        bytesBefore += bytes.length;
        segsBefore++;
      }
      const base = { bytes: bytesBefore, segs: segsBefore };
      const parts = await downloadSegments(track.segments, {
        concurrency,
        maxRetries,
        signal,
        gate: job.gate,
        maxBytes: MAX_STREAM_BYTES - bytesBefore,
        onProgress: (bytes, segs) => {
          const now = Date.now();
          if (now - lastPost < 250 && segs < track.segments.length) return;
          lastPost = now;
          const done = base.bytes + bytes;
          const doneSegs = base.segs + segs;
          // Without a bandwidth-based estimate, extrapolate from completed segments.
          const total = estimated ?? Math.round((done / doneSegs) * segmentsTotal);
          post({ target: 'background', type: 'STREAM_PROGRESS', jobId, bytesReceived: done, totalBytes: Math.max(total, done), segmentsDone: doneSegs, segmentsTotal });
        },
      });
      const track0 = assembleTrack(track, init, parts);
      bytesBefore += track0.blob.size - (init?.size ?? 0);
      segsBefore += track.segments.length;
      assembled.push(track0);
    }
    const final = await finalizeTracks(assembled, signal);
    const outputs: StreamTrackOutput[] = final.map((t) => {
      const blobUrl = URL.createObjectURL(t.blob);
      blobUrls.add(blobUrl);
      return { blobUrl, size: t.blob.size, extension: t.extension, kind: t.kind };
    });
    post({ target: 'background', type: 'STREAM_DONE', jobId, outputs });
  } catch (e) {
    const err = toMediaForgeError(e);
    post({ target: 'background', type: 'STREAM_FAILED', jobId, errorCode: err.code, transient: err.transient, ...(err.detail ? { detail: err.detail } : {}) });
  } finally {
    jobs.delete(jobId);
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundToOffscreen, sender) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.target !== 'offscreen') return false;
  switch (msg.type) {
    case 'STREAM_START':
      // Duplicate start after a background restart: the job is already running.
      if (!jobs.has(msg.jobId)) void runJob(msg.jobId, msg.plan, Math.max(1, Math.min(12, msg.concurrency)), Math.max(0, Math.min(10, msg.maxRetries)));
      break;
    case 'STREAM_PAUSE':
      jobs.get(msg.jobId)?.gate.pause();
      break;
    case 'STREAM_RESUME':
      jobs.get(msg.jobId)?.gate.resume();
      break;
    case 'STREAM_CANCEL': {
      const j = jobs.get(msg.jobId);
      j?.gate.resume();
      j?.controller.abort();
      break;
    }
    case 'RELEASE_BLOB':
      if (blobUrls.delete(msg.blobUrl)) URL.revokeObjectURL(msg.blobUrl);
      break;
    case 'PING':
      break;
  }
  return false;
});
