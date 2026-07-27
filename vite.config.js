import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Egna portar (5399/8799) så FridgeTwin kan köras samtidigt med de andra
// projekten i mappen — TimeProxy tar 5199/8787, stadslager tar 8788.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5399,
    strictPort: true, // hellre ett tydligt fel än en tyst port-krock med en annan app
    proxy: {
      '/api': 'http://localhost:8799',
    },
  },
})
