import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X } from "lucide-react";

type Props = {
  contractId: string;
  documentUrl: string;
  partyName: string;
  role: "client" | "contractor";
  onSigned: () => void;
  onCancel: () => void;
};

export function ContractSigning({
  contractId,
  documentUrl,
  partyName,
  role,
  onSigned,
  onCancel,
}: Props) {
  const { toast } = useToast();
  const [nameInput, setNameInput] = useState("");
  const [signing, setSigning] = useState(false);

  const nameMatches =
    nameInput.trim().toLowerCase() === partyName.trim().toLowerCase();

  async function handleSign() {
    if (!nameMatches || signing) return;
    setSigning(true);
    try {
      const field =
        role === "client" ? "signed_by_client" : "signed_by_contractor";
      const { error } = await supabase
        .from("project_contracts")
        .update({ [field]: true })
        .eq("id", contractId);
      if (error) throw error;
      onSigned();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to record signature";
      toast({
        title: "Signing failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "#0f1b2d" }}
    >
      {/* Close button */}
      <button
        onClick={onCancel}
        style={{
          position: "fixed",
          top: 16,
          right: 20,
          zIndex: 51,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "rgba(255,255,255,0.7)",
          fontSize: 13,
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.14)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.08)")
        }
      >
        <X size={14} />
        Cancel
      </button>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 24px 48px" }}>
        <h1
          style={{ color: "white", fontSize: 22, fontWeight: 700, marginBottom: 4 }}
        >
          Contract Agreement
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          Review the contract document in full before signing.
        </p>

        {/* PDF preview */}
        <div
          style={{
            width: "100%",
            height: "60vh",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 28,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <iframe
            src={documentUrl}
            title="Contract document"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>

        {/* Sign section */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: 24,
          }}
        >
          <p
            style={{
              color: "white",
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Sign this contract
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
              marginBottom: 18,
            }}
          >
            Type your full name below to sign this contract. By signing you
            confirm you have read and agree to all terms.
          </p>

          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Type your full name to sign"
            autoComplete="off"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "white",
              marginBottom: 16,
            }}
            className="placeholder:text-white/25"
          />

          {nameInput.length > 0 && !nameMatches && (
            <p
              style={{
                color: "rgba(255,120,120,0.85)",
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              Name does not match. Expected: {partyName}
            </p>
          )}

          <Button
            onClick={handleSign}
            disabled={!nameMatches || signing}
            className="bg-orange-500 hover:bg-orange-400 text-white w-full"
          >
            {signing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Sign Contract
          </Button>
        </div>
      </div>
    </div>
  );
}
