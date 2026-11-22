import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getLayout } from './geometry/layout';
import { clearMeasureCache } from './geometry/text';
import { abcOfId } from './model/abc';
import { buildReport } from './model/reports';
import { diagramPngBlob, diagramSvgString } from './export/png';
import { loadDiagramFonts } from './render/fonts';
import { commit, getModel, modelStore, replaceModel, setUi, uiStore } from './store/store';
import { buildSampleModel } from './model/sample';
import { createModel } from './model/factory';
import './styles.css';

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(b);
  });
}

// Програмний інтерфейс для автотестів і налагодження
(window as unknown as Record<string, unknown>).kaskad = {
  getModel,
  getUi: () => uiStore.get(),
  getLayout: (id?: string) => getLayout(getModel(), id ?? uiStore.get().diagramId),
  abc: (boxId: string) => abcOfId(getModel(), boxId),
  report: (kind: 'model' | 'activities' | 'arrows' | 'abc', boxId?: string) => buildReport(getModel(), kind, boxId),
  svg: (id?: string) => diagramSvgString(getModel(), id ?? uiStore.get().diagramId),
  pngDataUrl: async (id?: string, scale?: number) => blobToDataUrl(await diagramPngBlob(getModel(), id ?? uiStore.get().diagramId, scale)),
  loadSample: () => replaceModel(buildSampleModel()),
  reset: () => replaceModel(createModel()),
  setUi,
  commit,
  history: () => ({ past: modelStore.get().past.length, future: modelStore.get().future.length }),
};

loadDiagramFonts().finally(() => {
  clearMeasureCache();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
