import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { workshopPlugin } from './server/plugin';

export default defineConfig({
  plugins: [react(), workshopPlugin()],
  // host: true → các máy trong cùng mạng LAN/Wi-Fi truy cập được
  server: { port: 5173, host: true },
  preview: { port: 5173, host: true },
});
