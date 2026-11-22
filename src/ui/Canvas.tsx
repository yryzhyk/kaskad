import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hitTest, type Hit } from '../geometry/hit';
import { getLayout, type Layout } from '../geometry/layout';
import { AREA, PAGE_H, PAGE_W } from '../geometry/page';
import { connectIdef0, connectIdef3, addBox, addJunction, addReferent, moveElement, resizeElement, findPositioned } from '../model/ops';
import type { Endpoint, Id, JunctionType, Model, Point, Side } from '../model/types';
import { NODE_TREE_ID } from '../model/types';
import { DiagramSvg } from '../render/DiagramSvg';
import { beginTransaction, commit, endTransaction, getModel, select, setUi, toast, uiStore, useModel, useUi } from '../store/store';
import { openDecompose } from './actions';

type Drag =
  | { type: 'move'; id: Id; start: Point; orig: Point; moved: boolean }
  | { type: 'resize'; id: Id; handle: string; start: Point; orig: { x: number; y: number; w: number; h: number } }
  | { type: 'label'; id: Id; start: Point; orig: Point; base: Point }
  | { type: 'bend'; id: Id; axis: 'x' | 'y' }
  | { type: 'endpoint'; id: Id; end: 'source' | 'target'; cursor: Point };

const SEL = '#2563eb';

function nearestBorder(p: Point): Side {
  const d = { left: Math.abs(p.x - AREA.left), right: Math.abs(AREA.right - p.x), top: Math.abs(p.y - AREA.top), bottom: Math.abs(AREA.bottom - p.y) };
  return (Object.keys(d) as Side[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
}

export function Canvas() {
  const model = useModel();
  const ui = useUi();
  const svgRef = useRef<SVGSVGElement>(null);
  const eventsRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [pending, setPending] = useState<{ src: Hit; start: Point; cursor: Point } | null>(null);
  const [endpointPreview, setEndpointPreview] = useState<Point | null>(null);
  const layout = getLayout(model, ui.diagramId);

  useEffect(() => {
    setPending(null);
  }, [ui.diagramId, ui.tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(null);
        if (uiStore.get().tool !== 'select') setUi({ tool: 'select' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // підбір масштабу під ширину вікна при першому показі
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if ((window as unknown as { __kaskadZoomSet?: boolean }).__kaskadZoomSet) return;
    (window as unknown as { __kaskadZoomSet?: boolean }).__kaskadZoomSet = true;
    fitZoom(el);
  }, []);

  if (!layout) return <div className="canvas-empty">Діаграму не знайдено</div>;

  const isTree = ui.diagramId === NODE_TREE_ID;
  const toPage = (e: { clientX: number; clientY: number }): Point => {
    const svg = eventsRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const finishConnection = (src: Hit, tgtPt: Point) => {
    const lay = getLayout(getModel(), ui.diagramId)!;
    const tgt = hitTest(lay, tgtPt, { labels: false });
    let res: { ok: boolean; message?: string; id?: Id } = { ok: false };
    commit((m) => {
      res = lay.kind === 'idef3' ? connectIdef3(m as Model, ui.diagramId, src, tgt) : connectIdef0(m as Model, ui.diagramId, src, tgt);
    });
    setPending(null);
    if (!res.ok) {
      if (res.message) toast(res.message, 'warn');
      return;
    }
    if (res.id) select(lay.kind === 'idef3' ? 'link' : 'arrow', res.id);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || isTree) return;
    // завершуємо редагування поля властивостей (і його крок історії)
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
    const p = toPage(e);
    const tool = ui.tool;
    const handleEl = (e.target as Element).closest('[data-handle]');
    if (handleEl && tool === 'select' && ui.selection) {
      const h = handleEl.getAttribute('data-handle')!;
      const id = ui.selection.id;
      if (h.startsWith('rs-')) {
        const el = findPositioned(model, ui.diagramId, id);
        if (el && el.w !== undefined && el.h !== undefined) {
          beginTransaction();
          drag.current = { type: 'resize', id, handle: h.slice(3), start: p, orig: { x: el.x, y: el.y, w: el.w, h: el.h } };
        }
      } else if (h.startsWith('seg-')) {
        beginTransaction();
        drag.current = { type: 'bend', id, axis: h === 'seg-x' ? 'x' : 'y' };
      } else if (h.startsWith('end-')) {
        beginTransaction();
        drag.current = { type: 'endpoint', id, end: h === 'end-source' ? 'source' : 'target', cursor: p };
      }
      eventsRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (tool === 'select') {
      const hit = hitTest(layout, p);
      if (hit.kind === 'box' || hit.kind === 'junction' || hit.kind === 'referent') {
        select(hit.kind, hit.id);
        const el = findPositioned(model, ui.diagramId, hit.id);
        if (el) {
          beginTransaction();
          drag.current = { type: 'move', id: hit.id, start: p, orig: { x: el.x, y: el.y }, moved: false };
          eventsRef.current?.setPointerCapture(e.pointerId);
        }
      } else if (hit.kind === 'label') {
        select(layout.kind === 'idef3' ? 'link' : 'arrow', hit.id);
        const a = layout.arrows.find((x) => x.id === hit.id);
        if (a?.label) {
          beginTransaction();
          drag.current = { type: 'label', id: hit.id, start: p, orig: { x: a.label.cx, y: a.label.cy }, base: a.label.base };
          eventsRef.current?.setPointerCapture(e.pointerId);
        }
      } else if (hit.kind === 'arrow') {
        select(layout.kind === 'idef3' ? 'link' : 'arrow', hit.id);
      } else {
        setUi({ selection: null });
      }
      e.preventDefault();
      return;
    }
    if (tool === 'box' || tool === 'uob' || tool === 'referent' || tool.startsWith('junction:')) {
      let res: { ok: boolean; message?: string; id?: Id } = { ok: false };
      commit((m) => {
        if (tool === 'box' || tool === 'uob') res = addBox(m as Model, ui.diagramId, p.x, p.y);
        else if (tool === 'referent') res = addReferent(m as Model, ui.diagramId, p.x, p.y);
        else {
          const [, type, sync] = tool.split(':');
          res = addJunction(m as Model, ui.diagramId, type as JunctionType, sync === 'sync', p.x, p.y);
        }
      });
      if (!res.ok && res.message) toast(res.message, 'warn');
      if (res.ok && res.id) {
        const kind = tool === 'referent' ? 'referent' : tool.startsWith('junction') ? 'junction' : 'box';
        setUi({ tool: 'select', selection: { kind, id: res.id } });
      }
      e.preventDefault();
      return;
    }
    if (tool === 'arrow' || tool === 'link') {
      if (pending) {
        finishConnection(pending.src, p);
      } else {
        const hit = hitTest(layout, p, { labels: false, arrows: tool === 'arrow' });
        if (tool === 'link' && hit.kind === 'empty') {
          toast('Почніть зв\'язок з одиниці роботи, перехрестя або об\'єкта-посилання.', 'warn');
          return;
        }
        setPending({ src: hit, start: p, cursor: p });
        eventsRef.current?.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toPage(e);
    if (pending) {
      setPending({ ...pending, cursor: p });
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.type === 'move') {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      commit((m) => moveElement(m as Model, ui.diagramId, d.id, d.orig.x + dx, d.orig.y + dy));
    } else if (d.type === 'resize') {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      const o = d.orig;
      let { x, y, w, h } = o;
      if (d.handle.includes('e')) w = o.w + dx;
      if (d.handle.includes('s')) h = o.h + dy;
      if (d.handle.includes('w')) {
        x = o.x + dx;
        w = o.w - dx;
      }
      if (d.handle.includes('n')) {
        y = o.y + dy;
        h = o.h - dy;
      }
      if (w < 70) {
        if (d.handle.includes('w')) x = o.x + o.w - 70;
        w = 70;
      }
      if (h < 40) {
        if (d.handle.includes('n')) y = o.y + o.h - 40;
        h = 40;
      }
      commit((m) => resizeElement(m as Model, ui.diagramId, d.id, { x, y, w, h }));
    } else if (d.type === 'label') {
      const cx = d.orig.x + (p.x - d.start.x);
      const cy = d.orig.y + (p.y - d.start.y);
      const offset = { x: Math.round(cx - d.base.x), y: Math.round(cy - d.base.y) };
      commit((m) => {
        const dg = (m as Model).diagrams[ui.diagramId];
        const a = dg.kind === 'idef0' ? dg.arrows.find((x) => x.id === d.id) : dg.links.find((x) => x.id === d.id);
        if (a) a.labelOffset = offset;
      });
    } else if (d.type === 'bend') {
      const value = Math.round(d.axis === 'x' ? p.x : p.y);
      commit((m) => {
        const dg = (m as Model).diagrams[ui.diagramId];
        const a = dg.kind === 'idef0' ? dg.arrows.find((x) => x.id === d.id) : dg.links.find((x) => x.id === d.id);
        if (a) a.bend = { axis: d.axis, value };
      });
    } else if (d.type === 'endpoint') {
      d.cursor = p;
      setEndpointPreview(p);
      // кінець на межі — пересуваємо вздовж межі
      const dg = getModel().diagrams[ui.diagramId];
      if (dg?.kind === 'idef0') {
        const a = dg.arrows.find((x) => x.id === d.id);
        const e0 = a?.[d.end];
        if (e0 && e0.kind === 'border' && !e0.parentArrowId) {
          const along = Math.round(e0.side === 'left' || e0.side === 'right' ? p.y : p.x);
          commit((m) => {
            const dd = (m as Model).diagrams[ui.diagramId];
            if (dd.kind !== 'idef0') return;
            const aa = dd.arrows.find((x) => x.id === d.id);
            const ee = aa?.[d.end];
            if (ee && ee.kind === 'border') ee.offset = along;
          });
        }
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toPage(e);
    if (pending) {
      if (Math.hypot(p.x - pending.start.x, p.y - pending.start.y) > 8) finishConnection(pending.src, p);
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d?.type === 'endpoint') {
      setEndpointPreview(null);
      retargetEndpoint(d.id, d.end, p);
    }
    if (d) endTransaction();
  };

  const retargetEndpoint = (arrowId: Id, end: 'source' | 'target', p: Point) => {
    const m0 = getModel();
    const dg = m0.diagrams[ui.diagramId];
    if (!dg || dg.kind !== 'idef0') return;
    const a = dg.arrows.find((x) => x.id === arrowId);
    if (!a) return;
    const cur = a[end];
    if (cur.kind === 'border') return; // межа рухається вздовж краю (оброблено в onPointerMove)
    const lay = getLayout(m0, ui.diagramId)!;
    const hit = hitTest({ ...lay, arrows: lay.arrows.filter((x) => x.id !== arrowId) }, p, { labels: false });
    const other = end === 'source' ? a.target : a.source;
    const linked = other.kind === 'border' && !!other.parentArrowId;
    let ne: Endpoint | null = null;
    if (hit.kind === 'box') ne = end === 'source' ? { kind: 'box', boxId: hit.id, role: 'output' } : { kind: 'box', boxId: hit.id, role: hit.zone };
    else if (hit.kind === 'arrow') ne = { kind: 'arrow', arrowId: hit.id, x: hit.point.x, y: hit.point.y };
    else if (hit.kind === 'empty') {
      if (linked) ne = { kind: 'point', x: Math.round(p.x), y: Math.round(p.y) };
      else if (other.kind !== 'border') ne = { kind: 'border', side: nearestBorder(p) };
    }
    if (!ne) return;
    const newEnd = ne;
    commit((m) => {
      const dd = (m as Model).diagrams[ui.diagramId];
      if (dd.kind !== 'idef0') return;
      const aa = dd.arrows.find((x) => x.id === arrowId);
      if (aa) {
        aa[end] = newEnd;
        delete aa.bend;
      }
    });
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isTree) {
      const g = (e.target as Element).closest('[data-tree-node]');
      const id = g?.getAttribute('data-tree-node');
      if (id) {
        const m = getModel();
        for (const d of Object.values(m.diagrams)) {
          const b = d.boxes.find((x) => x.id === id);
          if (b?.childDiagramId) setUi({ diagramId: b.childDiagramId, selection: null });
        }
      }
      return;
    }
    if (ui.tool !== 'select') return;
    const p = toPage(e);
    const hit = hitTest(layout, p);
    if (hit.kind === 'box') {
      const box = model.diagrams[ui.diagramId].boxes.find((b) => b.id === hit.id);
      if (box?.childDiagramId) setUi({ diagramId: box.childDiagramId, selection: null });
      else openDecompose(hit.id);
    }
  };

  const cursor = ui.tool === 'select' ? 'default' : 'crosshair';

  return (
    <div className="canvas-scroll" ref={scrollRef} data-testid="canvas-scroll">
      <div className="canvas-page" style={{ width: PAGE_W * ui.zoom, height: PAGE_H * ui.zoom }}>
        <DiagramSvg
          layout={layout}
          scale={ui.zoom}
          svgRef={svgRef}
          className="diagram-svg"
        >
          <Overlay layout={layout} model={model} pending={pending} endpointPreview={endpointPreview} />
        </DiagramSvg>
        <svg
          className="canvas-events"
          viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
          width={PAGE_W * ui.zoom}
          height={PAGE_H * ui.zoom}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          data-testid="canvas"
          ref={eventsRef}
        >
          <OverlayHandles layout={layout} />
          {isTree && <TreeHotspots layout={layout} />}
        </svg>
      </div>
    </div>
  );
}

export function fitZoom(el?: HTMLElement | null) {
  const c = el ?? document.querySelector<HTMLElement>('[data-testid="canvas-scroll"]');
  if (!c) return;
  const w = c.clientWidth - 32;
  const h = c.clientHeight - 32;
  const z = Math.max(0.3, Math.min(2, Math.min(w / PAGE_W, h / PAGE_H)));
  setUi({ zoom: Math.round(z * 100) / 100 });
}

function TreeHotspots({ layout }: { layout: Layout }) {
  const t = layout.tree;
  if (!t) return null;
  return (
    <g transform={`translate(${t.transform.tx},${t.transform.ty}) scale(${t.transform.scale})`}>
      {t.nodes.map((n) => (
        <rect key={n.boxId} data-tree-node={n.boxId} x={n.rect.x} y={n.rect.y} width={n.rect.w} height={n.rect.h} fill="transparent" style={{ cursor: 'pointer' }} />
      ))}
    </g>
  );
}

/** Підсвічування вибраного елемента та попередній перегляд нової стрілки. */
function Overlay({ layout, model, pending, endpointPreview }: { layout: Layout; model: Model; pending: { src: Hit; start: Point; cursor: Point } | null; endpointPreview: Point | null }) {
  const ui = useUi();
  const sel = ui.selection;
  const els: React.ReactNode[] = [];
  // назва не вміщається в блок — явне попередження (лише на полотні, не в експорті)
  for (const b of layout.boxes) {
    if (!b.overflow) continue;
    const r = b.rect;
    const text = '⚠ Назва не вміщається';
    const tw = 136;
    const ty = r.y - 22 < 44 ? r.y + r.h + 4 : r.y - 22;
    els.push(
      <g key={`ov-${b.id}`} data-overflow-warning={b.id} pointerEvents="none">
        <rect x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 3" />
        <rect x={r.x + r.w / 2 - tw / 2} y={ty} width={tw} height={18} rx={4} fill="#dc2626" />
        <text x={r.x + r.w / 2} y={ty + 13} fontSize={11} fontWeight={700} textAnchor="middle" fill="#fff" fontFamily="system-ui, sans-serif">
          {text}
        </text>
      </g>,
    );
  }
  if (sel) {
    if (sel.kind === 'box' || sel.kind === 'referent' || sel.kind === 'junction') {
      const r =
        layout.boxes.find((b) => b.id === sel.id)?.rect ??
        layout.referents.find((b) => b.id === sel.id)?.rect ??
        layout.junctions.find((b) => b.id === sel.id)?.rect;
      if (r) els.push(<rect key="sel" x={r.x - 3} y={r.y - 3} width={r.w + 6} height={r.h + 6} fill="none" stroke={SEL} strokeWidth={1.5} strokeDasharray="4 3" />);
    } else {
      const a = layout.arrows.find((x) => x.id === sel.id);
      if (a) {
        els.push(<polyline key="sel" points={a.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={SEL} strokeWidth={3} opacity={0.55} />);
        if (a.label) els.push(<rect key="lsel" x={a.label.cx - a.label.w / 2 - 2} y={a.label.cy - a.label.h / 2 - 2} width={a.label.w + 4} height={a.label.h + 4} fill="none" stroke={SEL} strokeDasharray="3 2" />);
      }
    }
  }
  if (pending) {
    const from = pending.src.kind === 'arrow' ? pending.src.point : pending.start;
    els.push(<line key="pend" x1={from.x} y1={from.y} x2={pending.cursor.x} y2={pending.cursor.y} stroke={SEL} strokeWidth={1.5} strokeDasharray="5 4" />);
    els.push(<circle key="pendc" cx={from.x} cy={from.y} r={4} fill={SEL} />);
    void model;
  }
  if (endpointPreview) els.push(<circle key="ep" cx={endpointPreview.x} cy={endpointPreview.y} r={5} fill="none" stroke={SEL} strokeWidth={2} />);
  return <g data-overlay="">{els}</g>;
}

/** Маркери зміни розміру, відрізків і кінців стрілки (у шарі подій). */
function OverlayHandles({ layout }: { layout: Layout }) {
  const ui = useUi();
  const sel = ui.selection;
  if (!sel || ui.tool !== 'select') return null;
  const els: React.ReactNode[] = [];
  const S = 8;
  if (sel.kind === 'box' || sel.kind === 'referent') {
    const r = layout.boxes.find((b) => b.id === sel.id)?.rect ?? layout.referents.find((b) => b.id === sel.id)?.rect;
    if (r) {
      const hs: [string, number, number, string][] = [
        ['nw', r.x, r.y, 'nwse-resize'],
        ['ne', r.x + r.w, r.y, 'nesw-resize'],
        ['sw', r.x, r.y + r.h, 'nesw-resize'],
        ['se', r.x + r.w, r.y + r.h, 'nwse-resize'],
      ];
      for (const [h, x, y, c] of hs)
        els.push(<rect key={h} data-handle={`rs-${h}`} x={x - S / 2} y={y - S / 2} width={S} height={S} fill="#fff" stroke={SEL} strokeWidth={1.5} style={{ cursor: c }} />);
    }
  } else if (sel.kind === 'arrow' || sel.kind === 'link') {
    const a = layout.arrows.find((x) => x.id === sel.id);
    if (a && a.points.length >= 2) {
      const p = a.points;
      for (let i = 1; i < p.length - 2; i++) {
        const horizontal = Math.abs(p[i].y - p[i + 1].y) < 0.5;
        const mx = (p[i].x + p[i + 1].x) / 2;
        const my = (p[i].y + p[i + 1].y) / 2;
        els.push(
          <rect
            key={`seg${i}`}
            data-handle={horizontal ? 'seg-y' : 'seg-x'}
            x={mx - 5}
            y={my - 5}
            width={10}
            height={10}
            fill={SEL}
            opacity={0.8}
            style={{ cursor: horizontal ? 'ns-resize' : 'ew-resize' }}
          />,
        );
      }
      if (sel.kind === 'arrow') {
        els.push(<circle key="es" data-handle="end-source" cx={p[0].x} cy={p[0].y} r={5} fill="#fff" stroke={SEL} strokeWidth={2} style={{ cursor: 'move' }} />);
        els.push(<circle key="et" data-handle="end-target" cx={p[p.length - 1].x} cy={p[p.length - 1].y} r={5} fill="#fff" stroke={SEL} strokeWidth={2} style={{ cursor: 'move' }} />);
      }
    }
  }
  return <g>{els}</g>;
}

