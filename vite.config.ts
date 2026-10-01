import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // Bộ mã hoá MozJPEG tự nạp file .wasm cạnh nó; để Vite gộp trước thì đường dẫn ấy bị gãy.
  optimizeDeps: { exclude: ['@jsquash/jpeg'] },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'], restoreMocks: true },
})
