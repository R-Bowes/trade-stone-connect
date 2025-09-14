import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle, Users, Shield, Zap } from "lucide-react";
import { useState } from "react";
import heroImage from "@/assets/hero-construction.jpg";
const HeroSection = () => {
  const [searchCode, setSearchCode] = useState("");
  const features = [{
    icon: Users,
    title: "Verified Contractors",
    description: "All professionals vetted and rated by real customers"
  }, {
    icon: Shield,
    title: "Secure Payments",
    description: "Protected escrow system with flexible payment terms"
  }, {
    icon: Zap,
    title: "AI-Powered",
    description: "Smart matching and instant construction advice"
  }];
  return <section className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 hero-gradient opacity-95" />
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20" style={{
      backgroundImage: `url(${heroImage})`
    }} />
      
      <div className="relative container mx-auto px-4 py-20 md:py-32 bg-neutral-500">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Content */}
          <div className="text-white">
            <div className="mb-6">
              <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
                <CheckCircle className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">Trusted by 10,000+ contractors</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
                Connect. Build.{" "}
                <span className="text-primary-glow">Grow.</span>
              </h1>
              
              <p className="text-xl text-white/90 mb-8 leading-relaxed">
                The complete platform connecting contractors with customers. 
                Manage your business, find new opportunities, and get paid securely.
              </p>
            </div>

            {/* Quick Search */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-8">
              <h3 className="text-lg font-semibold mb-4">Find a contractor by code</h3>
              <div className="flex space-x-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input placeholder="Enter TS code (e.g. TS A7K9M2)" value={searchCode} onChange={e => setSearchCode(e.target.value)} className="pl-10 bg-white text-gray-900 border-0" />
                </div>
                <Button variant="secondary" size="lg" className="bg-orange-400 hover:bg-orange-300">
                  Search
                </Button>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
              <Button size="lg" variant="secondary" className="shadow-hero bg-orange-400 hover:bg-orange-300">
                Join as Contractor
              </Button>
              <Button size="lg" variant="outline" className="border-white text-inherit bg-orange-400 hover:bg-orange-300">
                Find Contractors
              </Button>
            </div>
          </div>

          {/* Right Column - Features */}
          <div className="space-y-6">
            {features.map((feature, index) => <div key={index} className="bg-white/10 backdrop-blur-sm rounded-lg p-6 transition-bounce hover:bg-white/15">
                <div className="flex items-start space-x-4">
                  <div className="bg-primary/20 rounded-lg p-3">
                    <feature.icon className="h-6 w-6 text-white bg-transparent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-white/80">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>)}
          </div>
        </div>
      </div>
    </section>;
};
export default HeroSection;