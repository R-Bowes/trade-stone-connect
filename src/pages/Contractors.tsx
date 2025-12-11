import Header from "@/components/Header";
import ContractorDirectory from "@/components/ContractorDirectory";

const Contractors = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-8">
        <ContractorDirectory />
      </main>
    </div>
  );
};

export default Contractors;
