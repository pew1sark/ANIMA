import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5180 },

  /* Se publica en animatsc.com/app/ — dentro del mismo repositorio
     que el sitio, pero en su propia carpeta. Así el `assets/` del build no choca
     con el `assets/` del sitio, donde vive anima.js.

     El build sale a /app en la raíz del repo y se versiona: GitHub Pages sirve
     la rama tal cual, sin Actions. Cuando Pages pase a compilar por su cuenta,
     esto vuelve a `dist/` y la carpeta se deja de versionar. */
  base: '/app/',
  build: { outDir: path.resolve(__dirname, '../app'), emptyOutDir: true }
});
