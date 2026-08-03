-- Unblock the 10 silently-broken project-delivery tables (RLS enabled,
-- zero policies). Two helpers instead of the brief's single
-- is_project_party, because "poster" turned out not to be reliably a lone
-- individual: PostTenderForm.tsx sets posted_by to whichever authenticated
-- user submits the form (via the standard two-step profiles lookup), with
-- no owner-only gating — so a business account's posted_by is that
-- account's own profile id, and other active business_members of the same
-- company (if the poster happens to be the company owner) have no
-- built-in visibility today. is_project_poster() extends "poster" to that
-- company's members, matching how every other business-tier feature in
-- this codebase already treats company data as shared among members.
--
-- Several policies below deviate from the brief's literal SQL after
-- checking the actual schema/code — see the per-table notes.

-- ═══════════════════════════════════════════════════════════════════════
-- Helpers
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_project_poster(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
    AND (
      p.posted_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM companies c
        WHERE c.owner_id = p.posted_by
        AND is_company_member(c.id)
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION is_project_party(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT is_project_poster(p_project_id) OR EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND lead_contractor_id = auth.uid()
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. broadcast_emails — admin only (matches brief exactly)
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "broadcast_emails_select" ON broadcast_emails
  FOR SELECT USING (is_platform_admin());

CREATE POLICY "broadcast_emails_insert" ON broadcast_emails
  FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY "broadcast_emails_update" ON broadcast_emails
  FOR UPDATE USING (is_platform_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- 2. project_change_requests — project parties
-- Deviation: "poster can respond" extended to is_project_poster (company
-- members), not a bare posted_by = auth.uid() check.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pcr_select" ON project_change_requests
  FOR SELECT USING (is_project_party(project_id));

CREATE POLICY "pcr_insert" ON project_change_requests
  FOR INSERT WITH CHECK (
    is_project_party(project_id)
    AND submitted_by = auth.uid()
  );

CREATE POLICY "pcr_update" ON project_change_requests
  FOR UPDATE USING (
    submitted_by = auth.uid()
    OR is_project_poster(project_id)
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 3. project_contracts — project parties
-- Deviation: INSERT extended to is_project_poster (company members), not
-- a bare posted_by check — the live edge function that actually generates
-- these already writes via service_role (bypasses RLS entirely), so this
-- INSERT policy only matters for any future direct client insert.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pc_select" ON project_contracts
  FOR SELECT USING (is_project_party(project_id));

CREATE POLICY "pc_update" ON project_contracts
  FOR UPDATE USING (is_project_party(project_id));

CREATE POLICY "pc_insert" ON project_contracts
  FOR INSERT WITH CHECK (is_project_poster(project_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. project_jobs — linkage table
-- Deviation: brief's SQL used is_project_party for INSERT, but the only
-- live call site (ProposalReview.tsx:348, awarding phases to jobs after
-- accepting a proposal) is poster-only — the lead contractor isn't even
-- necessarily set at that point. Used is_project_poster instead.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pj_select" ON project_jobs
  FOR SELECT USING (is_project_party(project_id));

CREATE POLICY "pj_insert" ON project_jobs
  FOR INSERT WITH CHECK (is_project_poster(project_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 5. project_proposals — poster + submitting contractor
-- Deviation: poster-side checks extended to is_project_poster.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pp_select" ON project_proposals
  FOR SELECT USING (
    contractor_id = auth.uid()
    OR is_project_poster(project_id)
  );

CREATE POLICY "pp_insert" ON project_proposals
  FOR INSERT WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "pp_update" ON project_proposals
  FOR UPDATE USING (
    contractor_id = auth.uid()
    OR is_project_poster(project_id)
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 6. project_qanda — project parties + public Q&A
-- Deviation: the brief gated SELECT/INSERT for non-poster contractors on
-- "has a project_proposals row" — but the live flow (TenderDetail.tsx)
-- lets any contractor ask a private clarifying question BEFORE bidding,
-- with no proposal existing yet. Gating on a proposal would have broken
-- pre-bid clarification, the actual point of the feature. Instead: any
-- authenticated party can ask (their own question is always visible to
-- them), poster (+ company members) always sees everything and is the
-- only one who can answer/publish, and public questions are visible to
-- everyone once toggled. Added a WITH CHECK on insert (is_public = false)
-- since only the poster's UPDATE should ever flip a question public —
-- matches TenderDetail.tsx, which always inserts is_public: false.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pqa_select" ON project_qanda
  FOR SELECT USING (
    is_project_poster(project_id)
    OR asked_by = auth.uid()
    OR is_public = true
  );

CREATE POLICY "pqa_insert" ON project_qanda
  FOR INSERT WITH CHECK (
    asked_by = auth.uid()
    AND is_public = false
  );

CREATE POLICY "pqa_update" ON project_qanda
  FOR UPDATE USING (is_project_poster(project_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 7. project_sign_offs — project parties, immutable once created
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pso_select" ON project_sign_offs
  FOR SELECT USING (is_project_party(project_id));

CREATE POLICY "pso_insert" ON project_sign_offs
  FOR INSERT WITH CHECK (
    is_project_party(project_id)
    AND signed_off_by = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 8. project_snags — project parties
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "ps_select" ON project_snags
  FOR SELECT USING (is_project_party(project_id));

CREATE POLICY "ps_insert" ON project_snags
  FOR INSERT WITH CHECK (
    is_project_party(project_id)
    AND raised_by = auth.uid()
  );

CREATE POLICY "ps_update" ON project_snags
  FOR UPDATE USING (is_project_party(project_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 9. project_updates — project parties, append-only
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pu_select" ON project_updates
  FOR SELECT USING (is_project_party(project_id));

CREATE POLICY "pu_insert" ON project_updates
  FOR INSERT WITH CHECK (
    is_project_party(project_id)
    AND posted_by = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 10. proposal_attachments — proposal submitter + project poster
-- Deviation: DELETE gated on pp.status = 'submitted', not 'draft'.
-- project_proposals_status_check only permits
-- ('submitted','withdrawn','rejected','accepted') — 'draft' can never
-- exist, so the brief's literal condition would have been permanently
-- unsatisfiable (no one could ever delete an attachment). 'submitted'
-- (not yet accepted/rejected) is the actual "still amendable" state.
-- SELECT poster-side extended to is_project_poster.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "pa_select" ON proposal_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_proposals pp
      WHERE pp.id = proposal_attachments.proposal_id
      AND (
        pp.contractor_id = auth.uid()
        OR is_project_poster(pp.project_id)
      )
    )
  );

CREATE POLICY "pa_insert" ON proposal_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_proposals pp
      WHERE pp.id = proposal_attachments.proposal_id
      AND pp.contractor_id = auth.uid()
    )
  );

CREATE POLICY "pa_delete" ON proposal_attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_proposals pp
      WHERE pp.id = proposal_attachments.proposal_id
      AND pp.contractor_id = auth.uid()
      AND pp.status = 'submitted'
    )
  );
