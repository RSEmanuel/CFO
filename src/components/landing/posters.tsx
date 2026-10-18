import { CifraMark } from "@/components/brand/CifraMark";
import type { ReactNode } from "react";
import type { PosterLabels, SceneId } from "./types";

/**
 * Posters de muestra de la landing: dioramas isometricos hechos con SVG y los tokens de marca.
 * No contienen cifras reales: solo marcadores ("$X", "N") y barras sin eje.
 * Cuando existan los posters generados (public/scroll-world/posters/<id>.webp) reemplazan a estos.
 *
 * Todos los colores salen de variables --cifra-*; el modo oscuro lo resuelven los tokens.
 */

// Geometria isometrica 2:1. Unidades de "mosaico": x y y recorren el suelo, z sube.
const TW = 44;
const TH = 22;
const ZU = 44;
const OX = 800;
const OY = 430;
const SQRT2 = Math.SQRT2;

type Pt = [number, number, number];
const pt = (x: number, y: number, z = 0): [number, number] => [OX + (x - y) * TW, OY + (x + y) * TH - z * ZU];
const pts = (...list: Pt[]) => list.map(([x, y, z]) => pt(x, y, z).join(",")).join(" ");

type Tone = "surface" | "surface2" | "paper" | "brand" | "brandSoft" | "ink" | "ink2" | "ink3" | "line";
const FILL: Record<Tone, string> = {
  surface: "var(--cifra-surface)",
  surface2: "var(--cifra-surface-2)",
  paper: "var(--cifra-paper)",
  brand: "var(--cifra-brand)",
  brandSoft: "var(--cifra-brand-soft)",
  ink: "var(--cifra-ink)",
  ink2: "var(--cifra-ink-2)",
  ink3: "var(--cifra-ink-3)",
  line: "var(--cifra-line)",
};

/** Transformacion para dibujar en coordenadas locales (u a lo ancho, v hacia abajo) sobre la cara izquierda. */
function faceL(x: number, yPlane: number, zTop: number): string {
  const [e, f] = pt(x, yPlane, zTop);
  return `matrix(${TW} ${TH} 0 ${ZU} ${e} ${f})`;
}
/** Idem para la cara derecha; u corre hacia y decreciente, origen en el borde izquierdo (y mayor). */
function faceR(xPlane: number, yStart: number, zTop: number): string {
  const [e, f] = pt(xPlane, yStart, zTop);
  return `matrix(${TW} ${-TH} 0 ${ZU} ${e} ${f})`;
}

type BoxProps = { x: number; y: number; w: number; d: number; h: number; z?: number; tone?: Tone };

function Box({ x, y, w, d, h, z = 0, tone = "surface" }: BoxProps) {
  const style = { fill: FILL[tone] };
  const left = pts([x, y + d, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x, y + d, z]);
  const right = pts([x + w, y, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x + w, y, z]);
  const top = pts([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]);
  return (
    <g className="lp-box">
      <polygon points={left} style={style} />
      <polygon points={left} className="lp-shade lp-shade--l" />
      <polygon points={right} style={style} />
      <polygon points={right} className="lp-shade lp-shade--r" />
      <polygon points={top} style={style} />
    </g>
  );
}

/** Cuadricula de ventanas sobre la cara izquierda ("l") o derecha ("r") de una caja. */
function Windows({
  side,
  x,
  y,
  w,
  d,
  z = 0,
  h,
  cols,
  rows,
  tone = "brandSoft",
  mx = 0.35,
  my = 0.45,
}: BoxProps & { side: "l" | "r"; cols: number; rows: number; mx?: number; my?: number }) {
  const width = side === "l" ? w : d;
  const transform = side === "l" ? faceL(x, y + d, z + h) : faceR(x + w, y + d, z + h);
  const cw = (width - 2 * mx) / cols;
  const ch = (h - 2 * my) / rows;
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={mx + c * cw + cw * 0.2}
          y={my + r * ch + ch * 0.2}
          width={cw * 0.6}
          height={ch * 0.6}
          style={{ fill: FILL[tone] }}
        />,
      );
    }
  }
  return <g transform={transform}>{cells}</g>;
}

/**
 * Texto en coordenadas locales de una cara. Se dibuja a escala x100 y se reduce con transform
 * para evitar tamanos de fuente fraccionarios (se rasterizan mal en algunos navegadores).
 */
function FaceText({ x, y, size, anchor = "start", children }: { x: number; y: number; size: number; anchor?: "start" | "middle"; children: ReactNode }) {
  return (
    <text
      x={x * 100}
      y={y * 100}
      fontSize={size * 100}
      textAnchor={anchor}
      transform="scale(0.01)"
      className="cifra-num lp-face-text"
    >
      {children}
    </text>
  );
}

/** Isla base con rejilla de mosaicos. */
function Island({ w = 10, d = 10, th = 0.6 }: { w?: number; d?: number; th?: number }) {
  const lines: ReactNode[] = [];
  for (let i = 1; i < w; i += 1) {
    const [x1, y1] = pt(i, 0, 0);
    const [x2, y2] = pt(i, d, 0);
    lines.push(<line key={`a${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className="lp-grid" />);
  }
  for (let j = 1; j < d; j += 1) {
    const [x1, y1] = pt(0, j, 0);
    const [x2, y2] = pt(w, j, 0);
    lines.push(<line key={`b${j}`} x1={x1} y1={y1} x2={x2} y2={y2} className="lp-grid" />);
  }
  return (
    <g>
      <polygon
        points={pts([-0.2, -0.2, -th - 0.55], [w + 0.2, -0.2, -th - 0.55], [w + 0.2, d + 0.2, -th - 0.55], [-0.2, d + 0.2, -th - 0.55])}
        className="lp-ground-shadow"
      />
      <Box x={0} y={0} w={w} d={d} h={th} z={-th} tone="surface" />
      {lines}
    </g>
  );
}

/** Cilindro (monedas, base del medidor). cx, cy en mosaicos. */
function Cyl({ cx, cy, r, h, z = 0, tone = "surface" }: { cx: number; cy: number; r: number; h: number; z?: number; tone?: Tone }) {
  const [sx, sy] = pt(cx, cy, z);
  const rx = r * TW * SQRT2;
  const ry = r * TH * SQRT2;
  const style = { fill: FILL[tone] };
  return (
    <g className="lp-box">
      <ellipse cx={sx} cy={sy} rx={rx} ry={ry} style={style} />
      <rect x={sx - rx} y={sy - h * ZU} width={rx * 2} height={h * ZU} style={style} className="lp-cyl-body" />
      <ellipse cx={sx} cy={sy} rx={rx} ry={ry} className="lp-shade lp-shade--r" />
      <rect x={sx - rx} y={sy - h * ZU} width={rx} height={h * ZU} className="lp-shade lp-shade--l" />
      <ellipse cx={sx} cy={sy - h * ZU} rx={rx} ry={ry} style={style} />
    </g>
  );
}

function Tree({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Box x={x + 0.18} y={y + 0.18} w={0.18} d={0.18} h={0.35} tone="ink3" />
      <Box x={x} y={y} w={0.55} d={0.55} h={0.7} z={0.35} tone="brandSoft" />
    </g>
  );
}

/** Pieza plana sobre el suelo (camino, hoja, flecha). */
function Flat({ x, y, w, d, z = 0, tone = "line" }: { x: number; y: number; w: number; d: number; z?: number; tone?: Tone }) {
  return <polygon points={pts([x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z])} style={{ fill: FILL[tone] }} className="lp-flat" />;
}

/** Punto "dato confirmado" sobre una superficie (elipse solida en el plano del suelo). */
function GroundDot({ x, y, z = 0, r = 0.16, hollow = false }: { x: number; y: number; z?: number; r?: number; hollow?: boolean }) {
  const [sx, sy] = pt(x, y, z);
  return hollow ? (
    <ellipse cx={sx} cy={sy} rx={r * TW * SQRT2} ry={r * TH * SQRT2} className="lp-dot-hollow" />
  ) : (
    <ellipse cx={sx} cy={sy} rx={r * TW * SQRT2} ry={r * TH * SQRT2} style={{ fill: FILL.brand }} />
  );
}

type Item = { key: number; node: ReactNode };
/** Orden de pintado de atras hacia adelante (menor x+y primero). */
function paint(items: Item[]): ReactNode[] {
  return [...items].sort((a, b) => a.key - b.key).map((it, i) => <g key={i}>{it.node}</g>);
}

/* ---------------------------------------------------------------- escenas */

function Torre() {
  const items: Item[] = [
    {
      key: 2,
      node: (
        <g>
          <Box x={1} y={1} w={3} d={3} h={3.4} />
          <Windows side="l" x={1} y={1} w={3} d={3} h={2.2} z={1.2} cols={4} rows={2} />
          <Windows side="r" x={1} y={1} w={3} d={3} h={2.2} z={1.2} cols={4} rows={2} />
          <Box x={2.2} y={4} w={0.7} d={0.1} h={1.1} tone="ink" />
          <Box x={0.9} y={0.9} w={3.2} d={3.2} h={0.35} z={3.4} tone="brand" />
          <Box x={1} y={1} w={3} d={3} h={3.25} z={3.75} />
          <Windows side="l" x={1} y={1} w={3} d={3} h={3.25} z={3.75} cols={4} rows={3} />
          <Windows side="r" x={1} y={1} w={3} d={3} h={3.25} z={3.75} cols={4} rows={3} />
          <Box x={0.8} y={0.8} w={3.4} d={3.4} h={0.5} z={7} tone="brand" />
        </g>
      ),
    },
    {
      key: 7,
      node: (
        <g>
          <Box x={5.2} y={0.8} w={2.6} d={2.2} h={3.6} tone="surface2" />
          <Windows side="l" x={5.2} y={0.8} w={2.6} d={2.2} h={3.6} z={0} cols={3} rows={3} tone="surface" />
          <Windows side="r" x={5.2} y={0.8} w={2.6} d={2.2} h={3.6} z={0} cols={3} rows={3} tone="surface" />
          <Box x={5.1} y={0.7} w={2.8} d={2.4} h={0.25} z={3.6} tone="ink2" />
        </g>
      ),
    },
    {
      key: 10,
      node: (
        <g>
          <Box x={0.8} y={5.5} w={3} d={2} h={1.6} />
          <Box x={0.7} y={5.4} w={3.2} d={2.2} h={0.22} z={1.6} tone="brand" />
          <Windows side="l" x={0.8} y={5.5} w={3} d={2} h={1.6} z={0} cols={3} rows={1} my={0.4} />
          <Windows side="r" x={0.8} y={5.5} w={3} d={2} h={1.6} z={0} cols={2} rows={1} my={0.4} />
        </g>
      ),
    },
    { key: 12.8, node: <Tree x={6.2} y={5.6} /> },
    { key: 13.8, node: <Tree x={7.6} y={6.2} /> },
    { key: 11.7, node: <Tree x={8.6} y={3.1} /> },
    { key: 13, node: <Tree x={5.4} y={7.4} /> },
  ];
  return (
    <g>
      <Island />
      <Flat x={0} y={8.2} w={10} d={1.5} tone="line" />
      {[0.6, 2.6, 4.6, 6.6, 8.6].map((x) => (
        <Flat key={x} x={x} y={8.9} w={0.9} d={0.14} z={0.02} tone="surface" />
      ))}
      {paint(items)}
    </g>
  );
}

function Resultados() {
  const items: Item[] = [
    {
      key: 3,
      node: (
        <g>
          <Box x={3.6} y={0.8} w={1.8} d={1} h={0.3} tone="ink2" />
          <Box x={4.2} y={1.1} w={0.6} d={0.4} h={0.7} z={0.3} tone="ink2" />
          <Box x={1} y={1} w={7} d={0.5} h={4.7} z={0.9} tone="ink" />
          {/* Pantalla: coordenadas locales (u ancho, v abajo), 6.4 x 4.1 */}
          <g transform={faceL(1.3, 1.5, 5.3)}>
            <rect x={0} y={0} width={6.4} height={4.1} style={{ fill: FILL.surface }} />
            <rect x={0.3} y={0.3} width={2.2} height={0.18} style={{ fill: FILL.line }} />
            <rect x={0.3} y={0.62} width={1.3} height={0.12} style={{ fill: FILL.surface2 }} />
            <rect x={0.6} y={1.2} width={0.8} height={2.4} style={{ fill: FILL.brand }} />
            <rect x={1.8} y={1.2} width={0.8} height={0.9} style={{ fill: FILL.ink3, fillOpacity: 0.55 }} />
            <rect x={3} y={2.1} width={0.8} height={0.55} style={{ fill: FILL.ink3, fillOpacity: 0.55 }} />
            <rect x={4.2} y={2.65} width={0.8} height={0.95} style={{ fill: FILL.brand }} />
            <line x1={1.4} y1={1.2} x2={1.8} y2={1.2} className="lp-face-dash" />
            <line x1={2.6} y1={2.1} x2={3} y2={2.1} className="lp-face-dash" />
            <line x1={3.8} y1={2.65} x2={4.2} y2={2.65} className="lp-face-dash" />
            <line x1={0.3} y1={3.6} x2={6.1} y2={3.6} className="lp-face-axis" />
            <FaceText x={0.6} y={1.1} size={0.3}>$X</FaceText>
            <FaceText x={1.8} y={1.1} size={0.3}>-$X</FaceText>
            <FaceText x={3} y={2} size={0.3}>-$X</FaceText>
            <FaceText x={4.2} y={2.55} size={0.3}>$X</FaceText>
            <circle cx={5.6} cy={1.5} r={0.55} className="lp-face-ring" />
            <circle cx={5.6} cy={1.5} r={0.55} className="lp-face-ring-fill" pathLength={100} strokeDasharray="62 38" />
          </g>
        </g>
      ),
    },
    {
      key: 8.4,
      node: (
        <g>
          <Box x={1} y={3.6} w={2.4} d={1.4} h={0.3} tone="surface" />
          <GroundDot x={2.2} y={4.3} z={0.3} r={0.18} />
        </g>
      ),
    },
    {
      key: 10.6,
      node: (
        <g>
          <Box x={3.9} y={4.5} w={2.4} d={1.4} h={0.3} tone="brandSoft" />
          <GroundDot x={5.1} y={5.2} z={0.3} r={0.18} hollow />
        </g>
      ),
    },
    {
      key: 11,
      node: (
        <g>
          <Box x={7} y={4} w={1.5} d={1.9} h={0.18} tone="surface2" />
          <Box x={7.15} y={4.15} w={1.5} d={1.9} h={0.18} z={0.18} tone="surface" />
          <Box x={7.3} y={4.3} w={1.5} d={1.9} h={0.18} z={0.36} tone="surface2" />
        </g>
      ),
    },
    { key: 14, node: <Tree x={8.4} y={7.6} /> },
    { key: 7.4, node: <Tree x={0.6} y={7.8} /> },
  ];
  return (
    <g>
      <Island />
      {paint(items)}
    </g>
  );
}

function Caja({ labels }: { labels: PosterLabels }) {
  const [gx, gy] = pt(6.3, 7.3, 0.3);
  const gr = 1.25;
  const columns = [1.0, 1.95, 2.9, 3.85].map((x) => ({ key: x + 4.2, x }));
  const items: Item[] = [
    {
      key: 4,
      node: (
        <g>
          <Box x={0.8} y={0.8} w={4.4} d={3.2} h={2.8} />
          <Box x={0.5} y={0.5} w={5} d={3.9} h={0.45} z={2.8} tone="surface2" />
          <Box x={1.2} y={1.2} w={3.8} d={2.6} h={0.4} z={3.25} tone="brand" />
        </g>
      ),
    },
    {
      key: 6,
      node: <Box x={0.6} y={4} w={4.8} d={0.9} h={0.2} tone="surface2" />,
    },
    ...columns.map(({ key, x }) => ({ key, node: <Box x={x} y={4.2} w={0.4} d={0.4} h={2.6} z={0.2} tone="surface" /> })),
    {
      key: 8.2,
      node: (
        <g>
          <Flat x={5.6} y={2} w={1.2} d={0.5} z={0.03} tone="brand" />
          <polygon points={pts([6.8, 1.6, 0.03], [7.5, 2.25, 0.03], [6.8, 2.9, 0.03])} style={{ fill: FILL.brand }} className="lp-flat" />
        </g>
      ),
    },
    {
      key: 8,
      node: (
        <g>
          <Box x={7.2} y={0.6} w={1.2} d={4.6} h={0.35} tone="ink2" />
          <Box x={7.4} y={1.1} w={0.8} d={0.8} h={0.6} z={0.35} tone="brand" />
          <Box x={7.4} y={2.6} w={0.8} d={0.8} h={0.6} z={0.35} tone="surface" />
          <Box x={7.4} y={3.9} w={0.8} d={0.8} h={0.6} z={0.35} tone="brandSoft" />
        </g>
      ),
    },
    {
      key: 13.6,
      node: (
        <g>
          <Cyl cx={6.3} cy={7.3} r={gr} h={0.3} tone="surface2" />
          <ellipse cx={gx} cy={gy} rx={gr * 0.8 * TW * SQRT2} ry={gr * 0.8 * TH * SQRT2} className="lp-gauge-track" />
          <ellipse
            cx={gx}
            cy={gy}
            rx={gr * 0.8 * TW * SQRT2}
            ry={gr * 0.8 * TH * SQRT2}
            className="lp-gauge-fill"
            pathLength={100}
            strokeDasharray="64 36"
          />
          <text x={gx} y={gy + 8} textAnchor="middle" className="cifra-num lp-poster-big">
            N
          </text>
          <text x={gx} y={gy + 74} textAnchor="middle" className="lp-poster-label">
            {labels.months}
          </text>
        </g>
      ),
    },
    {
      key: 14.8,
      node: (
        <g>
          <Cyl cx={8.9} cy={6.2} r={0.55} h={0.18} tone="brand" />
          <Cyl cx={8.9} cy={6.2} r={0.55} h={0.18} z={0.18} tone="brand" />
          <Cyl cx={8.9} cy={6.2} r={0.55} h={0.18} z={0.36} tone="brand" />
          <Cyl cx={8.9} cy={6.2} r={0.55} h={0.18} z={0.54} tone="brand" />
        </g>
      ),
    },
    { key: 10.5, node: <Tree x={5.6} y={5.4} /> },
  ];
  return (
    <g>
      <Island />
      {paint(items)}
    </g>
  );
}

function Cobranza() {
  const houses: { x: number; y: number; hot?: boolean }[] = [
    { x: 0.9, y: 0.9 },
    { x: 6.0, y: 0.9 },
    { x: 0.9, y: 6.0 },
    { x: 6.0, y: 6.0, hot: true },
  ];
  const sheets: [number, number][] = [
    [4.75, 1.5],
    [4.65, 3],
    [5.1, 6.9],
    [4.7, 8.3],
    [1.7, 4.75],
    [3, 5.05],
    [7.1, 4.7],
    [8.4, 5],
  ];
  const items: Item[] = [
    ...houses.map(({ x, y, hot }) => ({
      key: x + y + 2.6,
      node: (
        <g>
          <Box x={x} y={y} w={2.6} d={2.6} h={1.5} />
          <Box x={x - 0.15} y={y - 0.15} w={2.9} d={2.9} h={0.3} z={1.5} tone={hot ? "brand" : "surface2"} />
          <Windows side="l" x={x} y={y} w={2.6} d={2.6} h={1.5} z={0} cols={2} rows={1} my={0.4} />
          <Windows side="r" x={x} y={y} w={2.6} d={2.6} h={1.5} z={0} cols={2} rows={1} my={0.4} />
          <Box x={x + 1.0} y={y + 2.6} w={0.6} d={0.08} h={0.9} tone={hot ? "brand" : "ink"} />
        </g>
      ),
    })),
    {
      key: 10,
      node: (
        <g>
          <Box x={4} y={4} w={2} d={2} h={1} tone="brand" />
          <Box x={3.9} y={3.9} w={2.2} d={2.2} h={0.15} z={1} tone="surface" />
          <GroundDot x={5} y={5} z={1.15} r={0.28} />
        </g>
      ),
    },
    ...sheets.map(([x, y]) => ({
      key: x + y + 0.6,
      node: (
        <g>
          <Box x={x} y={y} w={0.5} d={0.7} h={0.06} z={0.03} tone="surface" />
          <GroundDot x={x + 0.25} y={y + 0.35} z={0.09} r={0.08} />
        </g>
      ),
    })),
  ];
  return (
    <g>
      <Island />
      <Flat x={0} y={4.5} w={10} d={1} tone="line" />
      <Flat x={4.5} y={0} w={1} d={10} tone="line" />
      {paint(items)}
    </g>
  );
}

function Salud({ labels }: { labels: PosterLabels }) {
  const dials = [1.1, 3.0, 4.9];
  const marks: { state: "confirmed" | "estimated" | "missing"; label: string; x: number }[] = [
    { state: "confirmed", label: labels.confirmed, x: 560 },
    { state: "estimated", label: labels.estimated, x: 800 },
    { state: "missing", label: labels.missing, x: 1040 },
  ];
  return (
    <g>
      <g transform="translate(0 -50)">
      <Island />
      <Box x={0.8} y={0.8} w={8.4} d={0.5} h={4.7} z={0.5} tone="ink" />
      <Box x={3.6} y={0.9} w={2.8} d={0.3} h={0.5} tone="ink2" />
      <g transform={faceL(1.1, 1.3, 5.0)}>
        <rect x={0} y={0} width={7.8} height={4.1} style={{ fill: FILL.surface }} />
        {dials.map((u, i) => (
          <g key={u}>
            <circle cx={u + 0.7} cy={1.5} r={0.8} className="lp-face-ring" />
            <circle
              cx={u + 0.7}
              cy={1.5}
              r={0.8}
              className="lp-face-ring-fill"
              pathLength={100}
              strokeDasharray={i === 0 ? "74 26" : i === 1 ? "52 48" : "88 12"}
            />
            <FaceText x={u + 0.7} y={1.62} size={0.42} anchor="middle">
              {i === 1 ? "N" : "$X"}
            </FaceText>
          </g>
        ))}
        <rect x={6.8} y={0.8} width={0.7} height={0.14} style={{ fill: FILL.line }} />
        <rect x={6.8} y={1.1} width={0.45} height={0.14} style={{ fill: FILL.surface2 }} />
        <rect x={0.4} y={2.9} width={7} height={0.8} style={{ fill: FILL.surface2 }} />
        <rect x={0.4} y={2.9} width={4.2} height={0.8} style={{ fill: FILL.brandSoft }} />
      </g>
      <Box x={2.2} y={4.2} w={5.6} d={1.8} h={0.7} tone="surface2" />
      <Box x={2.4} y={4.4} w={5.2} d={1.4} h={0.12} z={0.7} tone="surface" />
      </g>
      {marks.map((m) => (
        <g key={m.state} transform={`translate(${m.x} 975)`}>
          <g style={{ color: "var(--cifra-brand)" }}>
            <g transform="translate(-20 -66)">
              <CifraMark state={m.state} size={40} />
            </g>
          </g>
          <text x={0} y={0} textAnchor="middle" className="lp-poster-label">
            {m.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function Mundo() {
  const ground: ReactNode[] = [
    <Flat key="p1" x={1} y={1} w={3} d={3} tone="surface2" />,
    <Flat key="p2" x={6} y={1} w={3} d={3} tone="surface2" />,
    <Flat key="p3" x={1} y={6} w={3} d={3} tone="surface2" />,
    <Flat key="p4" x={6} y={6} w={3} d={3} tone="surface2" />,
    <Flat key="r1" x={4} y={2.35} w={2} d={0.3} z={0.02} tone="brandSoft" />,
    <Flat key="r2" x={4} y={7.35} w={2} d={0.3} z={0.02} tone="brandSoft" />,
    <Flat key="r3" x={2.35} y={4} w={0.3} d={2} z={0.02} tone="brandSoft" />,
    <Flat key="r4" x={7.35} y={4} w={0.3} d={2} z={0.02} tone="brandSoft" />,
  ];
  const items: Item[] = [
    {
      key: 4,
      node: (
        <g>
          <Box x={1.8} y={1.8} w={1.4} d={1.4} h={5} />
          <Box x={1.7} y={1.7} w={1.6} d={1.6} h={0.3} z={5} tone="brand" />
          <Windows side="l" x={1.8} y={1.8} w={1.4} d={1.4} h={4.6} z={0} cols={2} rows={5} />
        </g>
      ),
    },
    {
      key: 9.4,
      node: (
        <g>
          <Box x={6.3} y={2.4} w={2.4} d={0.3} h={1.9} z={0.1} tone="ink" />
          <Box x={6.8} y={2} w={0.3} d={0.3} h={1.2} z={0.1} tone="brand" />
        </g>
      ),
    },
    {
      key: 8,
      node: (
        <g>
          <Box x={1.7} y={7} w={2.2} d={1.6} h={1.2} />
          <Box x={1.5} y={6.8} w={2.6} d={2} h={0.25} z={1.2} tone="brand" />
        </g>
      ),
    },
    {
      key: 10,
      node: (
        <g>
          <Cyl cx={5} cy={5} r={0.85} h={0.35} tone="surface" />
          <GroundDot x={5} y={5} z={0.35} r={0.22} />
        </g>
      ),
    },
    {
      key: 15,
      node: (
        <g>
          <Box x={6.5} y={6.6} w={1.2} d={1.2} h={1.2} />
          <Box x={6.4} y={6.5} w={1.4} d={1.4} h={0.22} z={1.2} tone="surface2" />
          <Box x={8} y={7.4} w={0.9} d={0.9} h={0.8} tone="surface" />
        </g>
      ),
    },
  ];
  return (
    <g>
      <Island />
      {ground}
      {paint(items)}
    </g>
  );
}

export function PosterArt({ id, labels }: { id: SceneId; labels: PosterLabels }) {
  let scene: ReactNode;
  switch (id) {
    case "torre":
      scene = <Torre />;
      break;
    case "resultados":
      scene = <Resultados />;
      break;
    case "caja":
      scene = <Caja labels={labels} />;
      break;
    case "cobranza":
      scene = <Cobranza />;
      break;
    case "salud":
      scene = <Salud labels={labels} />;
      break;
    default:
      scene = <Mundo />;
  }
  return (
    <svg
      className="lp-poster-art"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
      focusable="false"
    >
      {scene}
    </svg>
  );
}
