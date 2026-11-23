export type Slot = 'cold' | 'warm' | 'background'
export type AdapterKind = 'codex' | 'electron' | 'native'
export type Capability = 'supported' | 'candidate' | 'unavailable'
export interface MediaSetting { source: string; durationMs: number; fit: 'cover' | 'contain'; enabled: boolean; opacity: number }
export interface BindingFile { path: string; purpose: string; action: string }
export interface Adapter { kind: AdapterKind; executable: string; windowExecutable?:string; windowClass?:string; processModel?:'chromium'; args: string[]; title: string; pagePrefix: string; selectors: string[]; capability: Capability; evidence: string[]; files: BindingFile[] }
export interface Profile { id: string; name: string; adapter: Adapter; cold: MediaSetting; warm: MediaSetting; background: MediaSetting; createdAt: string; updatedAt: string }
export interface Asset { id: string; name: string; extension: string; kind: 'image' | 'video'; size: number }
export interface Database { version: 1; profiles: Profile[]; assets: Asset[] }
export interface ScanResult { folder: string; candidates: string[]; adapter: Adapter; suggestedName: string }
export type CalibrationCheck = 'cold' | 'warm' | 'foreground' | 'background'
export interface CheckResult { state:'passed'|'failed'; message:string; at:string }
export interface CalibrationReport { fingerprint:string; bindingKey?:string; boundAt?:string; checks:Partial<Record<CalibrationCheck,CheckResult>> }
export interface WindowCandidate { handle:string; pid:number; executable:string; title:string; windowClass:string; ancestors:number[]; width:number; height:number; minimized:boolean; score:number; reasons:string[] }
export interface CalibrationView { sessionId:string; windows:WindowCandidate[]; recommended?:string; launched:boolean; bound:boolean; report:CalibrationReport; running:boolean; visible:boolean; background:Capability; backgroundEnabled:boolean }
export interface LaunchResult { action:'cold'|'warm'|'foreground'; background:'passed'|'failed'|'skipped'|'unsupported' }
export interface Snapshot { database: Database; dataDirectory: string; packaged: boolean; version: string; verification?:Record<string,CalibrationReport> }
export interface PlayerViewport { x:number; y:number; width:number; height:number }
export interface VideoTimeline { backgroundURL: string; backgroundSource: string; loopEntrySeconds: number; fit: 'cover' | 'contain'; opacity: number; matched: boolean }
export interface HandoffFrame { source: string; seconds: number; video: boolean }
export interface PlayerHandoff { prepare(): Promise<HandoffFrame>; resumeAt(epochMs: number): void; reveal(durationMs: number, backdrop?: string): void }
export interface PlayerData { name: string; source: string; url: string; slot?: Slot; videoTimeline?: VideoTimeline; blinkURL?: string; viewport?: PlayerViewport; gallery?: import('./gallery-motion').GallerySpec; kind: 'legacy' | 'living' | 'image' | 'video' | 'gallery'; durationMs: number; fit: 'cover' | 'contain'; opacity: number; preview: boolean }
export interface LaunchEvent { profileId: string; stage: string; message: string; error?: boolean }
export interface StudioAPI {
  snapshot(): Promise<Snapshot>
  scan(path?: string): Promise<ScanResult | null>
  chooseExecutable(): Promise<ScanResult | null>
  importAdapter(): Promise<ScanResult | null>
  save(profile: Profile): Promise<Snapshot>
  remove(id: string): Promise<Snapshot>
  importMedia(): Promise<Asset | null>
  shortcut(id: string): Promise<string>
  exportAdapter(id: string): Promise<string | null>
  launch(id: string): Promise<void>
  preview(id: string, slot: Slot): Promise<void>
  previewTheme(id: string, themeId: string, slot: Slot): Promise<void>
  openData(): Promise<void>
  calibrationBegin(id:string):Promise<CalibrationView>
  calibrationRefresh(sessionId:string):Promise<CalibrationView>
  calibrationLaunch(sessionId:string):Promise<CalibrationView>
  calibrationBind(sessionId:string,handle:string,title:string):Promise<CalibrationView>
  calibrationTest(sessionId:string,check:CalibrationCheck):Promise<CalibrationView>
  calibrationEnd(sessionId:string):Promise<void>
  onLaunch(callback: (event: LaunchEvent) => void): () => void
}
export interface PlayerAPI { data(): Promise<PlayerData>; ready(error?: string): void; finished(): void; failed(error: string): void; onPlay(callback: () => void): void; onStatus(callback: (message: string) => void): void; onViewport(callback:(viewport:PlayerViewport)=>void):void }
declare global { interface Window { studio: StudioAPI; player: PlayerAPI; __launchCanvasPlayerHandoff?: PlayerHandoff } }

export const slots: Slot[] = ['cold', 'warm', 'background']
export function newProfile(adapter: Adapter, name: string): Profile {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name, adapter, createdAt: now, updatedAt: now,
    cold: { source: 'builtin:cold', durationMs: 12000, fit: 'cover', enabled: true, opacity: 100 },
    warm: { source: 'builtin:eye', durationMs: 1500, fit: 'cover', enabled: true, opacity: 100 },
    background: { source: 'builtin:background', durationMs: 0, fit: 'cover', enabled: adapter.capability === 'supported', opacity: 30 } }
}
export function mediaURL(source: string): string { return 'lc-media://asset/' + encodeURIComponent(source) }
export function mediaKind(source: string, assets: Asset[]): 'legacy' | 'image' | 'video' {
  if (source === 'builtin:cold') return 'legacy'
  if (source === 'builtin:eye') return 'video'
  return assets.find(asset => 'asset:' + asset.id === source)?.kind ?? 'image'
}
