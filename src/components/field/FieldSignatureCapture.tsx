import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { NAVY, ORANGE } from "./FieldHeader";

/**
 * Canvas signature capture — finger-first (Pointer Events, not mouse-only),
 * full-width and tall rather than landscape-locked (screen.orientation.lock
 * needs fullscreen and is unreliable on iOS Safari — a generously sized
 * portrait canvas sidesteps that entirely, per the brief's own fallback).
 *
 * Writes, in order: (1) the image as a job_photos row, tags: ['signature'],
 * same bucket/path convention as an ordinary photo, uploaded_by = the
 * TEAM MEMBER'S own profile id (attribution of capture); (2)
 * jobs.site_signed_off_at/site_signed_off_name/site_signed_off_by —
 * deliberately NOT signed_off_at/signed_off_by (the customer's own
 * attested act) or contractor_signed_off_at/name (the contractor's own
 * counter-signature) — see 20260808130000's column comments.
 */
export default function FieldSignatureCapture({
  jobId,
  ownProfileId,
  defaultName,
  onCaptured,
}: {
  jobId: string;
  ownProfileId: string;
  defaultName: string;
  onCaptured: (at: string, name: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const [name, setName] = useState(defaultName);
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  // Backing-store scaled to devicePixelRatio so strokes stay crisp, CSS
  // size stays the generous on-screen size regardless of pixel density.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = NAVY;
    }
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = getCtx();
    const { x, y } = pointFromEvent(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    const { x, y } = pointFromEvent(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
    hasStroke.current = true;
    if (empty) setEmpty(false);
  };

  const handlePointerUp = () => {
    drawing.current = false;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
    hasStroke.current = false;
    setEmpty(true);
  };

  const handleSave = async () => {
    if (!hasStroke.current) {
      toast.error("Please capture a signature first");
      return;
    }
    if (!name.trim()) {
      toast.error("Enter the signatory's name");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    try {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not capture signature image");

      const path = `${ownProfileId}/${jobId}/${Date.now()}-signature.png`;
      const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, blob, {
        contentType: "image/png",
      });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("job_photos").insert({
        job_id: jobId,
        uploaded_by: ownProfileId,
        uploaded_by_role: "contractor",
        storage_path: path,
        caption: `Signed by ${name.trim()}`,
        tags: ["signature"],
        visibility: "internal",
        file_type: "image",
        portfolio: false,
        photo_approval_status: "not_requested",
      });
      if (dbError) {
        await supabase.storage.from("job-photos").remove([path]);
        throw dbError;
      }

      const signedAt = new Date().toISOString();
      const { error: jobError } = await supabase
        .from("jobs")
        .update({
          site_signed_off_at: signedAt,
          site_signed_off_name: name.trim(),
          site_signed_off_by: ownProfileId,
        })
        .eq("id", jobId);
      if (jobError) throw jobError;

      toast.success("Signature captured");
      onCaptured(signedAt, name.trim());
    } catch (err) {
      toast.error("Couldn't save signature", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm text-muted-foreground block mb-1">Signed by</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name of person signing"
          className="w-full rounded-md border px-3"
          style={{ fontSize: 16, minHeight: 44 }}
        />
      </div>

      <div>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="w-full rounded-lg border-2 bg-white touch-none"
          style={{ height: 220, borderColor: "#cbd5e1" }}
        />
        {empty && (
          <p className="text-sm text-muted-foreground mt-1">Sign above with your finger</p>
        )}
      </div>

      {/* Clear sits well apart from Save so a stray thumb can't hit both —
          smaller, muted, left-aligned; Save is the large primary action. */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={handleClear}
          disabled={saving}
          className="rounded-lg border font-medium text-muted-foreground disabled:opacity-60"
          style={{ minHeight: 44, padding: "0 18px", fontSize: 16 }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ backgroundColor: ORANGE, minHeight: 48, fontSize: 16 }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save signature
        </button>
      </div>
    </div>
  );
}
