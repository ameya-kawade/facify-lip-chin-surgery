import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/facify-lip-chin-surgery/',
  plugins: [react()],
  define: {
    global: 'window',
  },
})
