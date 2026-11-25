export const QUADRANTS = ["do", "schedule", "delegate", "eliminate"] as const;
export type Quadrant = typeof QUADRANTS[number];
export type Zone = Quadrant | "inbox";
export const ZONES: Zone[] = ["do", "schedule", "delegate", "eliminate", "inbox"];
export type LanguageSetting = "auto" | "ru" | "en";
export type SubtaskMode = "nested" | "separate" | "hidden";
export type Source = { kind: "folder" | "file"; path: string; recursive: boolean };
export interface MatrixConfig {
  version: 1;
  id: string;
  source: Source;
  inboxFile: string;
  subtasks: SubtaskMode;
  language: LanguageSetting;
  assignments: Record<string, Quadrant>;
  order: Record<Zone, string[]>;
}
export interface Task {
  id: string;
  anchor: string | null;
  path: string;
  line: number; // zero-based line number at the time of scanning
  raw: string;
  text: string;
  group?: string; // Display label from the enclosing Obsidian callout (if any)
  done: boolean;
  indent: number;
  parentId: string | null;
}
export type TaskEdit = { done?: boolean; text?: string; remove?: boolean };
export const ZONE_NAMES: Record<Zone, string> = {
  do: "I. Срочно и важно",
  schedule: "II. Важно, не срочно",
  delegate: "III. Срочно, не важно",
  eliminate: "IV. Не срочно и не важно",
  inbox: "Входящие"
};
export function emptyOrder(): Record<Zone, string[]> {
  return { do: [], schedule: [], delegate: [], eliminate: [], inbox: [] };
}
export function newId(): string {
  // Browser crypto API is supported on desktop and mobile; no Node dependency.
  const random = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replace(/-/g, "")
    : Array.from({length: 6}, () => Math.random().toString(36).slice(2, 6)).join("");
  return `em-${random.slice(0, 24)}`;
}
