import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Circle, Pencil, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tool = "circle" | "arrow" | "pen";
type Pt = { x: number; y: number };
type Shape = { tool: Tool; color: string; pts: Pt[] };

// Annotation ink is baked into the photo pixels, so these are literal paint colors, not UI theme tokens.
const INKS = [
  { name: "Red", value: "#ef4444" },
  { name: "Yellow", value: "#facc15" },
  { name: "White", value: "#ffffff" },
];

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, lw: number) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = lw;
  const a = s.pts[0]!;
  const b = s.pts[s.pts.length - 1]!;
  ctx.beginPath();
  if (s.tool === "circle") {
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else if (s.tool === "arrow") {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const h = lw * 4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - h * Math.cos(ang - 0.45), b.y - h * Math.sin(ang - 0.45));
    ctx.lineTo(b.x - h * Math.cos(ang + 0.45), b.y - h * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  } else {
    s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

/** Lets a tech circle / arrow / scribble on a photo; resolves with the marked-up JPEG (or the untouched file). */
export function PhotoMarkupDialog({
  file,
  onCancel,
  onDone,
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (img: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>("circle");
  const [color, setColor] = useState(INKS[0]!.value);

  useEffect(() => {
    setShapes([]);
    setDraft(null);
    setBmp(null);
    if (!file) return;
    let alive = true;
    createImageBitmap(file).then((b) => {
      if (!alive) return;
      const scale = Math.min(1, 1600 / Math.max(b.width, b.height));
      createImageBitmap(b, {
        resizeWidth: Math.round(b.width * scale),
        resizeHeight: Math.round(b.height * scale),
      }).then((r) => alive && setBmp(r));
    });
    return () => {
      alive = false;
    };
  }, [file]);

  const lw = bmp ? Math.max(4, Math.round(Math.max(bmp.width, bmp.height) / 160)) : 6;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !bmp) return;
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    [...shapes, ...(draft ? [draft] : [])].forEach((s) => drawShape(ctx, s, lw));
  }, [bmp, shapes, draft, lw]);

  function pos(e: React.PointerEvent): Pt {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }

  function save() {
    canvasRef.current?.toBlob((b) => b && onDone(b), "image/jpeg", 0.85);
  }

  const tools: { id: Tool; label: string; icon: typeof Circle }[] = [
    { id: "circle", label: "Circle", icon: Circle },
    { id: "arrow", label: "Arrow", icon: ArrowUpRight },
    { id: "pen", label: "Draw", icon: Pencil },
  ];

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Mark up photo</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md bg-secondary p-1">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm",
                  tool === t.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {INKS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={`${c.name} ink`}
                aria-pressed={color === c.value}
                onClick={() => setColor(c.value)}
                className={cn(
                  "h-7 w-7 rounded-full border-2",
                  color === c.value ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!shapes.length}
            onClick={() => setShapes((s) => s.slice(0, -1))}
          >
            <Undo2 className="mr-1 h-4 w-4" /> Undo
          </Button>
        </div>
        <div className="flex max-h-[60vh] justify-center overflow-hidden rounded-md bg-muted">
          {bmp ? (
            <canvas
              ref={canvasRef}
              aria-label="Photo markup canvas"
              className="max-h-[60vh] max-w-full cursor-crosshair touch-none object-contain"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = pos(e);
                setDraft({ tool, color, pts: [p, p] });
              }}
              onPointerMove={(e) =>
                draft &&
                setDraft({
                  ...draft,
                  pts: draft.tool === "pen" ? [...draft.pts, pos(e)] : [draft.pts[0]!, pos(e)],
                })
              }
              onPointerUp={() => {
                if (draft) setShapes((s) => [...s, draft]);
                setDraft(null);
              }}
            />
          ) : (
            <div className="h-64 w-full animate-pulse" />
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => file && onDone(file)}>
            Use without markup
          </Button>
          <Button type="button" onClick={save} disabled={!bmp}>
            Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
