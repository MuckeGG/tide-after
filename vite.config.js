import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
var REFERENCE_ALLOWLIST = {
    '/__tide-reference/wood-tile.png': 'Images/Tiles_30.png',
    '/__tide-reference/platform-edge.png': 'Images/Tiles_19.png',
    '/__tide-reference/slot-frame.png': 'Images/UI/DisplaySlots_5.png',
};
var tideReferencePlugin = function (assetRoot) { return ({
    name: 'tide-reference-assets',
    apply: 'serve',
    configureServer: function (server) {
        var root = path.resolve(assetRoot);
        server.middlewares.use(function (request, response, next) {
            var _a;
            var pathname = (_a = request.url) === null || _a === void 0 ? void 0 : _a.split('?')[0];
            var relative = pathname
                ? REFERENCE_ALLOWLIST[pathname]
                : undefined;
            if (!relative) {
                next();
                return;
            }
            var target = path.resolve(root, relative);
            if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) {
                response.statusCode = 404;
                response.end();
                return;
            }
            response.setHeader('Content-Type', 'image/png');
            response.setHeader('Cache-Control', 'no-store');
            fs.createReadStream(target).pipe(response);
        });
    },
}); };
export default defineConfig(function (_a) {
    var command = _a.command, mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var artMode = env.VITE_TIDE_ART_MODE === 'reference' ? 'reference' : 'original';
    if (command === 'build' && artMode === 'reference') {
        throw new Error('Production builds cannot use TIDE reference assets. Set VITE_TIDE_ART_MODE=original.');
    }
    var plugins = [react()];
    if (command === 'serve' && artMode === 'reference' && env.TIDE_REFERENCE_ASSET_ROOT) {
        plugins.push(tideReferencePlugin(env.TIDE_REFERENCE_ASSET_ROOT));
    }
    return {
        plugins: plugins,
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
    };
});
