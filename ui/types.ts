export type Config = Record<string, string | string[] | number | boolean | null | { name: string }>;
export type CardId = "filters" | "greeting" | "logs";
export interface ReleaseInfo { version: string; title: string; date: string; notes: string[] }
export interface VersionUpdate {
  checking: boolean; kind: "" | "available" | "installed" | "current" | "error";
  releases: ReleaseInfo[]; status: string; message: string;
  currentVersion: string; personalBuild: boolean; open: boolean;
}
export interface Preferences {
  orderVersion: number;
  expanded: boolean;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  settingsOrder: CardId[];
  insightOrder: CardId[];
  layout: Record<string, number>;
}
export interface PanelModel {
  demo?: boolean;
  version: string;
  title: string;
  platform: string;
  platformId: string;
  onlineLabel: string;
  homeSetup: boolean;
  collapsed: boolean;
  running: boolean;
  previewing: boolean;
  resumeImport?: { busy: boolean; draftText: string; source: string; message: string; revision: number };
  versionUpdate?: VersionUpdate;
  canStop: boolean;
  status: string;
  current: string;
  counters: { scanned: number; matched: number; applied: number; skipped: number; failed: number; previewed: number };
  dailyCount: number;
  dailyLimit: number;
  remainingQuota: number | null;
  roundLimit?: number;
  roundUsed?: number;
  config: Config;
  hasKey: boolean;
  previewError?: string;
  previewProgress?: string;
  logs: { time: string; level: string; message: string }[];
  preview: null | { origin?: "platform" | "assistant"; job: string; source: string; text: string; review: string; status: string };
}
