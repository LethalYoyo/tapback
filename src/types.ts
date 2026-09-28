export type Settings = { volume: number; sensitivity: number; cooldown: number; pitch: number; shuffle: boolean; dynamics: boolean; visual: boolean; pack: string; source: string; quiet: boolean; launchAtLogin: boolean; mute: boolean };
export type Clip = { id: string; name: string; duration: number; enabled: boolean; createdAt: string };
export type SensorEvent = { type: string; message?: string; x?: number; y?: number; z?: number };
export type State = { settings: Settings; clips: Clip[]; stats: { total: number; best: number }; platform: string; version: string; shortcuts: Record<string, boolean> };
export type Bridge = {
  state(): Promise<State>; settings(value: Settings): Promise<Settings>; stats(value: { total: number; best: number }): Promise<void>;
  saveClip(meta: { name: string; duration: number }, bytes: Uint8Array): Promise<Clip>;
  readClip(id: string): Promise<Uint8Array>; updateClip(id: string, changes: Partial<Clip>): Promise<Clip>; deleteClip(id: string): Promise<void>;
  exportPack(): Promise<boolean>; importPack(): Promise<Clip[] | null>;
  sensorStart(): Promise<SensorEvent>; sensorStop(): Promise<void>; microphone(): Promise<boolean>;
  status(active: boolean): Promise<void>; hide(): Promise<void>;
  on(channel: 'action' | 'sensor', callback: (value: any) => void): () => void;
};
declare global { interface Window { tapback: Bridge; } }
