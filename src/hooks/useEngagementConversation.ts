import { useEffect, useState } from "react";
import { getOrCreateEngagementConversation } from "@/lib/engagementConversation";
import { useMessages } from "@/hooks/useMessages";

interface EngagementContext {
  enquiryId?: string | null;
  quoteId?: string | null;
  jobId?: string | null;
}

/**
 * Resolves the one job_conversations thread for this engagement (see
 * getOrCreateEngagementConversation) and wires it to useMessages for the
 * contractor's side of the thread.
 */
export function useEngagementConversation({ enquiryId, quoteId, jobId }: EngagementContext) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setConversationId(null);

    if (!jobId && !quoteId && !enquiryId) {
      setResolving(false);
      return;
    }

    getOrCreateEngagementConversation({ jobId, quoteId, enquiryId })
      .then((id) => {
        if (!cancelled) setConversationId(id);
      })
      .catch((e) => console.error("Failed to resolve engagement conversation", e))
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, quoteId, enquiryId]);

  const messagesState = useMessages(conversationId, "contractor");

  return { conversationId, resolving: resolving || messagesState.loading, ...messagesState };
}
