// supabase/functions/geocode-postcode/index.ts
//
// Resolves a UK postcode to lat/lng via postcodes.io (free, no API key,
// UK-only). Body: { postcode: string }.
//
// Authenticated contractors only -- validates the caller's JWT via
// auth.getUser() before doing anything else, same pattern as
// accept-quote/index.ts. Does NOT write to profiles or any other table --
// it resolves and returns; the client persists whatever it decides to
// (postcode, service_area_center_lat/_lng today; reusable later for a job
// postcode or anything else that needs a one-off geocode without a write
// tied to it).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Vite dev server runs on 8080, not the Vite default 5173 -- see
// CLAUDE.md's Edge Function secrets section. Matches the ALLOWED_ORIGINS
// list every other function in this repo carries (hand-duplicated, no
// shared CORS helper exists yet).
const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

interface PostcodesIoResult {
  latitude: number;
  longitude: number;
  admin_district: string | null;
  outcode: string;
}

interface PostcodesIoResponse {
  status: number;
  result?: PostcodesIoResult;
  error?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"));

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return json(401, { error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("ADMIN_SECRET_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Unauthorized" });

    let body: { postcode?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body" });
    }

    const postcode = body.postcode?.trim();
    if (!postcode) {
      return json(400, { error: "postcode is required" });
    }

    // postcodes.io normalises spacing/casing itself -- pass the trimmed
    // value through as-is, just URL-encoded for the path segment.
    let pcResponse: Response;
    try {
      pcResponse = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
    } catch (fetchErr) {
      console.error("geocode-postcode: postcodes.io unreachable", fetchErr);
      return json(502, { error: "Postcode lookup service is unavailable right now. Please try again." });
    }

    if (pcResponse.status === 404) {
      return json(422, { error: "That postcode wasn't recognised. Check it and try again." });
    }

    if (pcResponse.status === 429) {
      return json(429, { error: "Too many postcode lookups right now. Please try again in a moment." });
    }

    if (!pcResponse.ok) {
      console.error("geocode-postcode: postcodes.io returned", pcResponse.status);
      return json(502, { error: "Postcode lookup service is unavailable right now. Please try again." });
    }

    let pcBody: PostcodesIoResponse;
    try {
      pcBody = await pcResponse.json();
    } catch (parseErr) {
      console.error("geocode-postcode: postcodes.io returned non-JSON", parseErr);
      return json(502, { error: "Postcode lookup service is unavailable right now. Please try again." });
    }

    if (!pcBody.result) {
      return json(422, { error: "That postcode wasn't recognised. Check it and try again." });
    }

    return json(200, {
      latitude: pcBody.result.latitude,
      longitude: pcBody.result.longitude,
      admin_district: pcBody.result.admin_district,
      outcode: pcBody.result.outcode,
    });
  } catch (err) {
    // Belt and braces -- nothing above should reach here, but a client of
    // this function must never see an unhandled 500 with no body.
    console.error("geocode-postcode: unexpected error", err);
    return json(500, { error: "Something went wrong resolving that postcode. Please try again." });
  }
});
