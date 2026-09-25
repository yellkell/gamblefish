import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

// IWSDK's dev plugin injects the IWER WebXR emulator so the island can be
// flown in a desktop browser without a headset. On a real Quest browser it
// stays out of the way and the native WebXR session is used.
export default defineConfig({
  base: './',
  plugins: [
    iwsdkDev({
      // Emulate a Quest 3 device profile during local development.
      emulator: { device: 'metaQuest3' },
    }),
  ],
  server: {
    host: true,
    port: 5180,
  },
  build: {
    target: 'esnext',
    // the game, and the page the LOG IN email's link opens on a phone
    rollupOptions: { input: { main: 'index.html', login: 'login.html' } },
  },
});
