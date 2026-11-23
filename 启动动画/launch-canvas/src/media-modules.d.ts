declare module '*.mjs' {
  export function createLivingWallpaper(openURL: string, closedURL: string): {
    ready: Promise<boolean>
    dispose(): void
    setStrength(value: number): void
    pause(value: boolean): void
  } | null
}
