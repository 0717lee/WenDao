import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const apiTarget = env.VITE_API_URL || 'http://localhost:8000'

    return {
        plugins: [react()],
        server: {
            port: 5173,
            open: true,
            proxy: {
                '/api': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                '/health': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('react-graph-vis') || id.includes('vis-network')) {
                            return 'graph-core'
                        }

                        if (id.includes('html-to-image') || id.includes('file-saver')) {
                            return 'graph-export'
                        }

                        return undefined
                    },
                },
            },
        },
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: './src/__tests__/setup.ts',
        },
    }
})
