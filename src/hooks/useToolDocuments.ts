import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ToolDocument = Database["public"]["Tables"]["tool_documents"]["Row"];

const BUCKET = "tool-documents";

export function useToolDocuments(toolId: string | null) {
  const [documents, setDocuments] = useState<ToolDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!toolId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("tool_documents")
      .select("*")
      .eq("tool_id", toolId)
      .order("uploaded_at", { ascending: false });
    if (error) {
      console.error("Error loading tool documents:", error);
    } else {
      setDocuments(data ?? []);
    }
    setLoading(false);
  }, [toolId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadDocument = useCallback(
    async (toolId: string, contractorId: string, file: File, documentType: string) => {
      const filePath = `${contractorId}/${toolId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("tool_documents").insert({
        tool_id: toolId,
        file_name: file.name,
        file_path: filePath,
        document_type: documentType,
      });
      if (insertError) throw insertError;

      await load();
    },
    [load],
  );

  const deleteDocument = useCallback(
    async (docId: string, filePath: string) => {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([filePath]);
      if (storageError) throw storageError;

      const { error: deleteError } = await supabase.from("tool_documents").delete().eq("id", docId);
      if (deleteError) throw deleteError;

      await load();
    },
    [load],
  );

  const getSignedUrl = useCallback(async (filePath: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  return { documents, loading, uploadDocument, deleteDocument, getSignedUrl, refetch: load };
}
