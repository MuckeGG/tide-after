import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type PluginOption } from 'vite'

const REFERENCE_ALLOWLIST = {
  '/__tide-reference/wood-tile.png': 'Images/Tiles_30.png',
  '/__tide-reference/platform-edge.png': 'Images/Tiles_19.png',
  '/__tide-reference/slot-frame.png': 'Images/UI/DisplaySlots_5.png',
} as const

const tideReferencePlugin = (assetRoot: string): Plugin => ({
  name: 'tide-reference-assets',
  apply: 'serve',
  configureServer(server) {
    const root = path.resolve(assetRoot)
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?')[0]
      const relative = pathname
        ? REFERENCE_ALLOWLIST[pathname as keyof typeof REFERENCE_ALLOWLIST]
        : undefined
      if (!relative) {
        next()
        return
      }
      const target = path.resolve(root, relative)
      if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) {
        response.statusCode = 404
        response.end()
        return
      }
      response.setHeader('Content-Type', 'image/png')
      response.setHeader('Cache-Control', 'no-store')
      fs.createReadStream(target).pipe(response)
    })
  },
})

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const artMode = env.VITE_TIDE_ART_MODE === 'reference' ? 'reference' : 'original'
  if (command === 'build' && artMode === 'reference') {
    throw new Error('Production builds cannot use TIDE reference assets. Set VITE_TIDE_ART_MODE=original.')
  }

  const plugins: PluginOption[] = [react()]
  if (command === 'serve' && artMode === 'reference' && env.TIDE_REFERENCE_ASSET_ROOT) {
    plugins.push(tideReferencePlugin(env.TIDE_REFERENCE_ASSET_ROOT))
  }

  return {
    plugins,
    define: {
      __TIDE_ART_MODE__: JSON.stringify(artMode),
    },
    server: {
      port: 3008,
    },
    publicDir: 'public',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, './index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
