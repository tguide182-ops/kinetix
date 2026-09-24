import { redactUrl } from './errors';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  scope: string;
  msg: string;
}

const MAX_ENTRIES = 300;
const buffer: LogEntry[] = [];
let debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
  if (!enabled) buffer.length = 0;
}

export function isDebugLogging(): boolean {
  return debugEnabled;
}

/** Replace URLs in log text with redacted versions so tokens never land in logs. */
function scrub(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (u) => redactUrl(u)).slice(0, 2000);
}

function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Scoped logger. Debug/info output is dropped unless debug logging is on;
 * warnings/errors are always kept in the (in-memory, local-only) ring buffer.
 */
export function createLogger(scope: string): Logger {
  const log = (level: LogLevel, args: unknown[]): void => {
    if (!debugEnabled && (level === 'debug' || level === 'info')) return;
    const entry: LogEntry = { t: Date.now(), level, scope, msg: scrub(stringify(args)) };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
    if (debugEnabled) {
      const fn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
      fn(`[MediaForge:${scope}]`, entry.msg);
    }
  };
  return {
    debug: (...a) => log('debug', a),
    info: (...a) => log('info', a),
    warn: (...a) => log('warn', a),
    error: (...a) => log('error', a),
  };
}

export function getLogEntries(): LogEntry[] {
  return buffer.slice();
}

export function clearLog(): void {
  buffer.length = 0;
}
