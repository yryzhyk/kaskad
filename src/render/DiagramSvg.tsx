import type { ReactNode } from 'react';
import type { ArrowLayout, Layout } from '../geometry/layout';
import { AREA, BOX_FONT_SIZE, DIAGRAM_FONT, FRAME_MARGIN, LABEL_FONT_SIZE, PAGE_H, PAGE_W, SMALL_FONT_SIZE, UOB_STRIP } from '../geometry/page';
import type { Point } from '../model/types';

const FONT = `${DIAGRAM_FONT}, Arial, 'Liberation Sans', sans-serif`;
const STROKE = '#000';

interface Props {
  layout: Layout;
  exportMode?: boolean;
  scale?: number;
  children?: ReactNode;
  fontCss?: string;
  svgRef?: React.Ref<SVGSVGElement>;
  className?: string;
}

function pts(p: Point[]): string {
  return p.map((q) => `${q.x},${q.y}`).join(' ');
}

function arrowHead(a: Point, b: Point, len = 10, half = 3.5): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const bx = b.x - ux * len;
  const by = b.y - uy * len;
  return `${b.x},${b.y} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`;
}

function shorten(points: Point[], by: number): Point[] {
  if (points.length < 2) return points;
  const res = points.map((p) => ({ ...p }));
  const a = res[res.length - 2];
  const b = res[res.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const k = Math.min(by, l) / l;
  res[res.length - 1] = { x: b.x - dx * k, y: b.y - dy * k };
  return res;
}

function TextLines({ lines, cx, top, size, weight }: { lines: string[]; cx: number; top: number; size: number; weight?: number }) {
  return (
    <text x={cx} y={top} fontSize={size} textAnchor="middle" fontWeight={weight} fill={STROKE}>
      {lines.map((l, i) => (
        <tspan key={i} x={cx} dy={i === 0 ? size * 0.85 : size + 2}>
          {l || ' '}
        </tspan>
      ))}
    </text>
  );
}

function Tunnel({ x, y, side }: { x: number; y: number; side: string }) {
  // круглі дужки біля кінця тунельованої стрілки
  const horizontal = side === 'left' || side === 'right';
  const sgn = side === 'left' || side === 'top' ? 1 : -1;
  if (horizontal) {
    const x1 = x + sgn * 6;
    const x2 = x + sgn * 16;
    return (
      <g fill="none" stroke={STROKE} strokeWidth={1}>
        <path d={`M${x1 + 3},${y - 7} Q${x1 - 3},${y} ${x1 + 3},${y + 7}`} />
        <path d={`M${x2 - 3},${y - 7} Q${x2 + 3},${y} ${x2 - 3},${y + 7}`} />
      </g>
    );
  }
  const y1 = y + sgn * 6;
  const y2 = y + sgn * 16;
  return (
    <g fill="none" stroke={STROKE} strokeWidth={1}>
      <path d={`M${x - 7},${y1 + 3} Q${x},${y1 - 3} ${x + 7},${y1 + 3}`} />
      <path d={`M${x - 7},${y2 - 3} Q${x},${y2 + 3} ${x + 7},${y2 - 3}`} />
    </g>
  );
}

function ArrowShape({ a, exportMode }: { a: ArrowLayout; exportMode?: boolean }) {
  if (a.points.length < 2) return null;
  const n = a.points.length;
  const line = a.head ? shorten(a.points, 6) : a.points;
  return (
    <g data-arrow={a.id}>
      <polyline points={pts(line)} fill="none" stroke={STROKE} strokeWidth={1.3} strokeDasharray={a.dashed ? '6 4' : undefined} strokeLinejoin="miter" />
      {a.head && <polygon points={arrowHead(a.points[n - 2], a.points[n - 1])} fill={STROKE} />}
      {a.doubleHead && <polygon points={arrowHead(a.points[n - 2], shorten(a.points, 9)[n - 1])} fill={STROKE} />}
      {a.icom && (
        <text x={a.icom.x} y={a.icom.y} fontSize={SMALL_FONT_SIZE} textAnchor={a.icom.anchor} fill={STROKE}>
          {a.icom.text}
        </text>
      )}
      {a.tunnel && <Tunnel {...a.tunnel} />}
      {a.label && (
        <g data-label={a.id}>
          {a.label.leader && (
            <line x1={a.label.leader[0].x} y1={a.label.leader[0].y} x2={a.label.leader[1].x} y2={a.label.leader[1].y} stroke={STROKE} strokeWidth={0.7} />
          )}
          {!exportMode && <rect x={a.label.cx - a.label.w / 2} y={a.label.cy - a.label.h / 2} width={a.label.w} height={a.label.h} fill="transparent" />}
          <TextLines lines={a.label.lines} cx={a.label.cx} top={a.label.cy - a.label.h / 2 + 1} size={LABEL_FONT_SIZE} />
        </g>
      )}
    </g>
  );
}

function Frame({ layout }: { layout: Layout }) {
  const f = layout.frame;
  const L = FRAME_MARGIN;
  const R = PAGE_W - FRAME_MARGIN;
  const B = PAGE_H - FRAME_MARGIN;
  const nodeW = 170;
  const numW = 120;
  const ctxW = 170;
  const small = 9;
  const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  return (
    <g data-frame="">
      <rect x={L} y={L} width={R - L} height={B - L} fill="none" stroke={STROKE} strokeWidth={1.5} />
      {/* верхня рамка */}
      <line x1={L} y1={AREA.top} x2={R} y2={AREA.top} stroke={STROKE} strokeWidth={1} />
      <line x1={L + 300} y1={L} x2={L + 300} y2={AREA.top} stroke={STROKE} strokeWidth={0.8} />
      <line x1={L + 620} y1={L} x2={L + 620} y2={AREA.top} stroke={STROKE} strokeWidth={0.8} />
      <line x1={R - ctxW} y1={L} x2={R - ctxW} y2={AREA.top} stroke={STROKE} strokeWidth={0.8} />
      <text x={L + 5} y={L + 12} fontSize={small} fill={STROKE}>АВТОР:</text>
      <text x={L + 5} y={L + 27} fontSize={11} fill={STROKE}>{cut(f.author, 44)}</text>
      <text x={L + 305} y={L + 12} fontSize={small} fill={STROKE}>ПРОЕКТ:</text>
      <text x={L + 305} y={L + 27} fontSize={11} fill={STROKE}>{cut(f.project, 46)}</text>
      <text x={L + 625} y={L + 12} fontSize={small} fill={STROKE}>ДАТА:</text>
      <text x={L + 625} y={L + 27} fontSize={11} fill={STROKE}>{f.date}</text>
      <text x={R - ctxW + 5} y={L + 12} fontSize={small} fill={STROKE}>КОНТЕКСТ:</text>
      <text x={R - ctxW / 2} y={L + 27} fontSize={11} textAnchor="middle" fill={STROKE}>{f.context}</text>
      {/* нижня рамка */}
      <line x1={L} y1={AREA.bottom} x2={R} y2={AREA.bottom} stroke={STROKE} strokeWidth={1} />
      <line x1={L + nodeW} y1={AREA.bottom} x2={L + nodeW} y2={B} stroke={STROKE} strokeWidth={1} />
      <line x1={R - numW} y1={AREA.bottom} x2={R - numW} y2={B} stroke={STROKE} strokeWidth={1} />
      <text x={L + 5} y={AREA.bottom + 12} fontSize={small} fill={STROKE}>ВУЗОЛ:</text>
      <text x={L + nodeW / 2} y={AREA.bottom + 34} fontSize={16} textAnchor="middle" fontWeight={700} fill={STROKE} data-frame-node="">{f.node}</text>
      <text x={L + nodeW + 5} y={AREA.bottom + 12} fontSize={small} fill={STROKE}>НАЗВА:</text>
      <text x={(L + nodeW + R - numW) / 2} y={AREA.bottom + 32} fontSize={15} textAnchor="middle" fontWeight={700} fill={STROKE} data-frame-title="">{cut(f.title, 80)}</text>
      <text x={R - numW + 5} y={AREA.bottom + 12} fontSize={small} fill={STROKE}>НОМЕР:</text>
      <text x={R - numW / 2} y={AREA.bottom + 34} fontSize={16} textAnchor="middle" fill={STROKE} data-frame-number="">{f.number}</text>
    </g>
  );
}

export function DiagramSvg({ layout, exportMode, scale = 1, children, fontCss, svgRef, className }: Props) {
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      width={PAGE_W * scale}
      height={PAGE_H * scale}
      fontFamily={FONT}
      className={className}
      data-diagram={layout.diagramId}
    >
      {fontCss && <style>{fontCss}</style>}
      <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="#fff" data-bg="" />
      <Frame layout={layout} />
      {layout.boxes.map((b) => {
        const r = b.rect;
        const textH = b.kind === 'uob' ? r.h - UOB_STRIP : r.h - 8;
        const blockH = b.lines.length * (BOX_FONT_SIZE + 2) - 2;
        const top = r.y + Math.max(3, (textH - blockH) / 2);
        return (
          <g key={b.id} data-box={b.id}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#fff" stroke={STROKE} strokeWidth={1.5} />
            <TextLines lines={b.lines} cx={r.x + r.w / 2} top={top} size={BOX_FONT_SIZE} />
            {b.kind === 'box' ? (
              <text x={r.x + r.w - 4} y={r.y + r.h - 4} fontSize={SMALL_FONT_SIZE} textAnchor="end" fill={STROKE} data-box-number="">
                {b.number}
              </text>
            ) : (
              <>
                <line x1={r.x} y1={r.y + r.h - UOB_STRIP} x2={r.x + r.w} y2={r.y + r.h - UOB_STRIP} stroke={STROKE} strokeWidth={1} />
                <line x1={r.x + r.w * 0.4} y1={r.y + r.h - UOB_STRIP} x2={r.x + r.w * 0.4} y2={r.y + r.h} stroke={STROKE} strokeWidth={1} />
                <text x={r.x + r.w * 0.2} y={r.y + r.h - 5} fontSize={SMALL_FONT_SIZE} textAnchor="middle" fill={STROKE} data-box-number="">
                  {b.number}
                </text>
                {b.ref && (
                  <text x={r.x + r.w * 0.7} y={r.y + r.h - 5} fontSize={SMALL_FONT_SIZE - 1} textAnchor="middle" fill={STROKE}>
                    {b.ref.length > 14 ? b.ref.slice(0, 13) + '…' : b.ref}
                  </text>
                )}
              </>
            )}
            {b.cost && (
              <text x={r.x + 4} y={b.kind === 'box' ? r.y + r.h - 4 : r.y + r.h - UOB_STRIP - 4} fontSize={SMALL_FONT_SIZE - 1} fill={STROKE} data-box-cost="">
                {b.cost}
              </text>
            )}
          </g>
        );
      })}
      {layout.referents.map((r) => (
        <g key={r.id} data-referent={r.id}>
          <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={r.rect.h} fill="#fff" stroke={STROKE} strokeWidth={1.2} />
          <TextLines lines={r.lines} cx={r.rect.x + r.rect.w / 2} top={r.rect.y + Math.max(3, (r.rect.h - (r.lines.length * 14 - 2)) / 2)} size={BOX_FONT_SIZE - 1} />
        </g>
      ))}
      {layout.junctions.map((j) => (
        <g key={j.id} data-junction={j.id}>
          <rect x={j.rect.x} y={j.rect.y} width={j.rect.w} height={j.rect.h} fill="#fff" stroke={STROKE} strokeWidth={1.5} />
          {j.sync && (
            <>
              <line x1={j.rect.x + 4} y1={j.rect.y} x2={j.rect.x + 4} y2={j.rect.y + j.rect.h} stroke={STROKE} strokeWidth={1.2} />
              <line x1={j.rect.x + j.rect.w - 4} y1={j.rect.y} x2={j.rect.x + j.rect.w - 4} y2={j.rect.y + j.rect.h} stroke={STROKE} strokeWidth={1.2} />
            </>
          )}
          <text x={j.rect.x + j.rect.w / 2} y={j.rect.y + j.rect.h / 2 + 6} fontSize={17} fontWeight={700} textAnchor="middle" fill={STROKE}>
            {j.symbol}
          </text>
          <text x={j.rect.x + j.rect.w / 2} y={j.rect.y - 4} fontSize={SMALL_FONT_SIZE - 1} textAnchor="middle" fill={STROKE}>
            {j.label}
          </text>
        </g>
      ))}
      {layout.arrows.map((a) => (
        <ArrowShape key={a.id} a={a} exportMode={exportMode} />
      ))}
      {layout.tree && (
        <g transform={`translate(${layout.tree.transform.tx},${layout.tree.transform.ty}) scale(${layout.tree.transform.scale})`} data-tree="">
          {layout.tree.lines.map((l, i) => (
            <polyline key={i} points={pts(l)} fill="none" stroke={STROKE} strokeWidth={1.3} />
          ))}
          {layout.tree.nodes.map((n) => (
            <g key={n.boxId} data-tree-node={n.boxId}>
              <rect x={n.rect.x} y={n.rect.y} width={n.rect.w} height={n.rect.h} fill="#fff" stroke={STROKE} strokeWidth={1.5} />
              <TextLines lines={n.lines} cx={n.rect.x + n.rect.w / 2} top={n.rect.y + Math.max(4, (n.rect.h - 12 - (n.lines.length * 15 - 2)) / 2)} size={BOX_FONT_SIZE} />
              <text x={n.rect.x + n.rect.w - 4} y={n.rect.y + n.rect.h - 4} fontSize={SMALL_FONT_SIZE} textAnchor="end" fill={STROKE}>
                {n.number}
              </text>
            </g>
          ))}
        </g>
      )}
      {children}
    </svg>
  );
}
