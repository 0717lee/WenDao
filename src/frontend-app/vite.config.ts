import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        open: true,
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'three-core': ['three'],
                    'r3f': ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
                    'recharts': ['recharts'],
                },
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/__tests__/setup.ts',
    },
})
