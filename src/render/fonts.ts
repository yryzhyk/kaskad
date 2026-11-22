import { cyr400, cyr700, cyrx400, lat400, lat700 } from 'virtual:kaskad-fonts';
import { DIAGRAM_FONT } from '../geometry/page';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const CYR_EXT = 'U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F';

function face(src: string, weight: number, range: string): string {
  return `@font-face{font-family:'${DIAGRAM_FONT}';font-style:normal;font-weight:${weight};src:url(${src}) format('woff2');unicode-range:${range};}`;
}

/**
 * CSS з вбудованим шрифтом (Arimo — метрично сумісний з Arial, містить кирилицю).
 * Використовується і в застосунку, і в експортованих SVG/PNG, тому кирилиця
 * відображається однаково незалежно від шрифтів системи.
 */
export const FONT_FACE_CSS = [
  face(lat400, 400, LATIN),
  face(cyr400, 400, CYR),
  face(cyrx400, 400, CYR_EXT),
  face(lat700, 700, LATIN),
  face(cyr700, 700, CYR),
].join('\n');

export async function loadDiagramFonts(): Promise<void> {
  const style = document.createElement('style');
  style.setAttribute('data-kaskad-fonts', '');
  style.textContent = FONT_FACE_CSS;
  document.head.appendChild(style);
  try {
    await Promise.all([
      document.fonts.load(`13px ${DIAGRAM_FONT}`, 'Робота Aa1 ґєії'),
      document.fonts.load(`bold 13px ${DIAGRAM_FONT}`, 'Робота Aa1'),
      document.fonts.load(`13px ${DIAGRAM_FONT}`, '₴'),
    ]);
  } catch {
    /* шрифт не завантажився — використовуємо системний */
  }
}
