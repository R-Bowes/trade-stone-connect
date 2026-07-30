-- SCORING.md Phase 2 Step 5: peer_endorsements (Section 3.1 "Peer endorsement").

CREATE TABLE public.peer_endorsements (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id                   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endorsed_id                   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endorsement_text              text,
  endorser_craft_score_at_time  numeric,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT peer_endorsements_no_self_endorse CHECK (endorser_id != endorsed_id),
  CONSTRAINT peer_endorsements_unique_pair UNIQUE (endorser_id, endorsed_id)
);

ALTER TABLE public.peer_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users insert own endorsements"
  ON public.peer_endorsements FOR INSERT
  TO authenticated
  WITH CHECK (endorser_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated users delete own endorsements"
  ON public.peer_endorsements FOR DELETE
  TO authenticated
  USING (endorser_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- No UPDATE policy at all — delete and re-create to change, per spec.

CREATE POLICY "Public reads all endorsements"
  ON public.peer_endorsements FOR SELECT
  USING (true);

CREATE POLICY "Service role full access to endorsements"
  ON public.peer_endorsements FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_peer_endorsements_endorsed ON public.peer_endorsements(endorsed_id);
