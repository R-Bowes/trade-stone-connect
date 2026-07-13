import { useSearchParams } from "react-router-dom";
import { ContractorTendersPipeline } from "./ContractorTendersPipeline";
import { ContractorTenderBrief } from "./ContractorTenderBrief";
import { ContractorTenderStub } from "./ContractorTenderStub";

interface Props {
  profileId: string;
}

// Thin router within the single "tenders" nav item/TabsContent — mirrors
// how the business side splits tenders/tender-form/tenders-stub across
// separate ?view= values, but the contractor sidebar is Tabs-based (see
// CLAUDE.md's Contractor Dashboard navigation pattern), so sub-navigation
// here happens via ?tender=/&mode= on top of the fixed ?view=tenders,
// rather than swapping ?view= itself.
export function ContractorTendersView({ profileId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tenderId = searchParams.get("tender");
  const mode = searchParams.get("mode");

  const openTender = (id: string) => {
    setSearchParams((prev) => {
      prev.set("tender", id);
      prev.delete("mode");
      return prev;
    }, { replace: true });
  };

  const backToPipeline = () => {
    setSearchParams((prev) => {
      prev.delete("tender");
      prev.delete("mode");
      return prev;
    }, { replace: true });
  };

  const backToBrief = () => {
    setSearchParams((prev) => {
      prev.delete("mode");
      return prev;
    }, { replace: true });
  };

  const goStub = (m: "ask" | "decline" | "apply") => {
    setSearchParams((prev) => {
      prev.set("mode", m);
      return prev;
    }, { replace: true });
  };

  if (tenderId && mode) {
    return <ContractorTenderStub mode={mode} onBack={backToBrief} />;
  }

  if (tenderId) {
    return (
      <ContractorTenderBrief
        profileId={profileId}
        tenderId={tenderId}
        onBack={backToPipeline}
        onStub={goStub}
      />
    );
  }

  return <ContractorTendersPipeline profileId={profileId} onOpenTender={openTender} />;
}
