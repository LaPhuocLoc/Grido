// Đóng gói main process + preload của Electron thành dist-electron/*.cjs.
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

export const buildElectron = (dev = false) =>
  build({
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    outdir: 'dist-electron',
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    // electron-updater nằm trong `dependencies` nên được đóng gói kèm nguyên bản, không gộp vào đây.
    external: ['electron', 'electron-updater'],
    sourcemap: dev,
    minify: !dev,
  })

if (import.meta.url === pathToFileURL(process.argv[1]).href) await buildElectron()
