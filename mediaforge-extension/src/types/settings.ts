import type { AudioQualityPreference, QualityPreference } from './media';

export type ThemePreference = 'system' | 'dark' | 'light';

export interface Settings {
  /** Sub-folder inside the browser's Downloads directory ("" = Downloads root). */
  downloadFolder: string;
  /** Ask where to save every file. */
  askWhereToSave: boolean;
  /** Filename template; tokens: {title} {quality} {site} {date}. */
  filenameTemplate: string;
  autoDownload: boolean;
  showFloatingPanel: boolean;
  maxConcurrentDownloads: number;
  maxRetries: number;
  /** Parallel segment requests per stream download. */
  segmentConcurrency: number;
  preferredVideoQuality: QualityPreference;
  preferredAudioQuality: AudioQualityPreference;
  autoDetect: boolean;
  showNotifications: boolean;
  theme: ThemePreference;
  debugLogging: boolean;
  excludedSites: string[];
  panelDisabledSites: string[];
}
