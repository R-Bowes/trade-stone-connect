-- 20260703190000_quote_notify_on_send.sql
-- notify_quote_issued must fire when a quote is SENT, not when a row is inserted.
-- Fresh quotes are inserted with sent_at already set → INSERT trigger with guard.
-- Revision drafts are inserted with sent_at null and sent later via UPDATE →
-- companion UPDATE trigger firing on the null → not-null transition.
-- Exactly one notification per quote either way.

DROP TRIGGER on_quote_issued ON public.issued_quotes;

CREATE TRIGGER on_quote_issued
  AFTER INSERT ON public.issued_quotes
  FOR EACH ROW
  WHEN (NEW.sent_at IS NOT NULL)
  EXECUTE FUNCTION public.notify_quote_issued();

CREATE TRIGGER on_quote_sent
  AFTER UPDATE OF sent_at ON public.issued_quotes
  FOR EACH ROW
  WHEN (OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL)
  EXECUTE FUNCTION public.notify_quote_issued();