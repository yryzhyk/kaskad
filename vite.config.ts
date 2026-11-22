import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Віртуальний модуль з шрифтом Arimo у вигляді data:-URL.
 * Шрифт вбудовується і в сторінку, і в експортовані SVG/PNG — кирилиця завжди відображається коректно.
 */
function embeddedFonts(): Plugin {
  const id = 'virtual:kaskad-fonts';
  const resolved = '\0' + id;
  const files: Record<string, string> = {
    lat400: 'arimo-latin-400-normal.woff2',
    lat700: 'arimo-latin-700-normal.woff2',
    cyr400: 'arimo-cyrillic-400-normal.woff2',
    cyr700: 'arimo-cyrillic-700-normal.woff2',
    cyrx400: 'arimo-cyrillic-ext-400-normal.woff2',
  };
  return {
    name: 'kaskad-embedded-fonts',
    resolveId(source) {
      return source === id ? resolved : null;
    },
    load(source) {
      if (source !== resolved) return null;
      const lines = Object.entries(files).map(([k, f]) => {
        const p = fileURLToPath(new URL(`./node_modules/@fontsource/arimo/files/${f}`, import.meta.url));
        const b64 = readFileSync(p).toString('base64');
        return `export const ${k} = "data:font/woff2;base64,${b64}";`;
      });
      return lines.join('\n');
    },
  };
}

// Сайт публікується на https://yryzhyk.github.io/kaskad/
export default defineConfig({
  base: '/kaskad/',
  plugins: [react(), embeddedFonts()],
  build: { chunkSizeWarningLimit: 1500 },
});
