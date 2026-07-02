import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // escuta em 0.0.0.0 para permitir acesso pelo celular na mesma rede Wi-Fi
  },
})
