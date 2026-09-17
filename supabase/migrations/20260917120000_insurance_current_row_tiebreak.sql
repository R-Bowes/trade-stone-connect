-- Fixes 20260916120000_insurance_customer_sharing.sql (pushed and live):
-- its "current insurance row" condition, `expires_at = MAX(expires_at)`,
-- returns every row tied for the latest expires_at, not exactly one. Two
-- insurance rows sharing an expires_at both satisfy it, the customer-facing
-- SELECT then returns two rows, and CustomerJobDocuments.tsx's
-- `.maybeSingle()` call rejects on 2+ rows — the component treats that
-- error identically to "no insurance on file" and the whole card silently
-- disappears (see the confirmed report: two rows, same expires_at,
-- maybeSingle() error, card returns null).
--
-- The retention trigger (trim_insurance_credentials, still correct and
-- unchanged) only caps row COUNT at two — it says nothing about
-- distinctness of expires_at, so this is a real, reachable data state, not
-- a hypothetical.
--
-- Fix: the policy must resolve to exactly one row id, always. Correlated
-- subquery selecting the single winning id (ORDER BY expires_at DESC,
-- created_at DESC LIMIT 1), not a MAX() equality comparison — a MAX()
-- comparison only breaks the FIRST tie (expires_at); breaking the second
-- tie (created_at, when two rows also share expires_at) would need a
-- second nested MAX() scoped to rows already tied on the first, which is
-- exactly what ORDER BY ... LIMIT 1 already does in one pass. Matching by
-- id afterwards is a plain primary-key equality, not a second date
-- comparison with its own NULL semantics to reason about.
--
-- Applied identically to both policies — the storage policy has always
-- duplicated this condition verbatim on purpose (see that policy's own
-- comment in 20260916120000), and diverging here would reopen exactly the
-- row/file mismatch that policy was written to prevent.

DROP POLICY IF EXISTS "Customers can read their contractor's current insurance"
  ON public.contractor_credentials;

CREATE POLICY "Customers can read their contractor's current insurance"
  ON public.contractor_credentials FOR SELECT
  TO authenticated
  USING (
    credential_type = 'insurance'
    AND id = (
      SELECT cc2.id
      FROM public.contractor_credentials cc2
      WHERE cc2.contractor_id = contractor_credentials.contractor_id
        AND cc2.credential_type = 'insurance'
      ORDER BY cc2.expires_at DESC, cc2.created_at DESC
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.contractor_id = contractor_credentials.contractor_id
        AND j.customer_id = auth.uid()
        AND (
          j.status IN ('scheduled', 'in_progress', 'snagging')
          OR (
            j.status IN ('complete', 'completed')
            AND j.completed_at IS NOT NULL
            AND j.completed_at >= now() - interval '90 days'
          )
        )
    )
  );

DROP POLICY IF EXISTS "contractor_compliance_docs_customer_insurance_read"
  ON storage.objects;

CREATE POLICY "contractor_compliance_docs_customer_insurance_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contractor-compliance-documents'
  AND EXISTS (
    SELECT 1
    FROM public.contractor_credentials cc
    WHERE cc.document_path = storage.objects.name
      AND cc.credential_type = 'insurance'
      AND cc.id = (
        SELECT cc2.id
        FROM public.contractor_credentials cc2
        WHERE cc2.contractor_id = cc.contractor_id
          AND cc2.credential_type = 'insurance'
        ORDER BY cc2.expires_at DESC, cc2.created_at DESC
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.contractor_id = cc.contractor_id
          AND j.customer_id = auth.uid()
          AND (
            j.status IN ('scheduled', 'in_progress', 'snagging')
            OR (
              j.status IN ('complete', 'completed')
              AND j.completed_at IS NOT NULL
              AND j.completed_at >= now() - interval '90 days'
            )
          )
      )
  )
);
