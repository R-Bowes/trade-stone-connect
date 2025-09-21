import { Button } from "@/components/ui/button";
import { Search, Menu, User, Building2 } from "lucide-react";
import { useState } from "react";
import Logo from "@/components/Logo";
const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  return <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <Logo className="h-10 w-auto" />
          <span className="text-xl font-bold text-foreground">TradeStone</span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          <a href="#directory" className="text-sm font-medium hover:text-primary transition-colors">
            Find Contractors
          </a>
          <a href="#contracts" className="text-sm font-medium hover:text-primary transition-colors">
            Contracts
          </a>
          <a href="#marketplace" className="text-sm font-medium hover:text-primary transition-colors">
            Marketplace
          </a>
          <a href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
            How It Works
          </a>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-3">
          <Button variant="ghost" size="sm">
            <User className="h-4 w-4 mr-2" />
            Sign In
          </Button>
          <Button size="sm" className="hero-gradient bg-orange-400 hover:bg-orange-300">
            Join as Pro
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <Menu className="h-5 w-5" />
        </Button>

        {/* Mobile Navigation */}
        {isMenuOpen && <div className="absolute top-16 left-0 right-0 bg-background border-b md:hidden">
            <nav className="flex flex-col space-y-3 p-4">
              <a href="#directory" className="text-sm font-medium hover:text-primary transition-colors">
                Find Contractors
              </a>
              <a href="#contracts" className="text-sm font-medium hover:text-primary transition-colors">
                Contracts
              </a>
              <a href="#marketplace" className="text-sm font-medium hover:text-primary transition-colors">
                Marketplace
              </a>
              <a href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
                How It Works
              </a>
              <div className="flex flex-col space-y-2 pt-3 border-t">
                <Button variant="ghost" size="sm">
                  <User className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
                <Button size="sm" className="hero-gradient">
                  Join as Pro
                </Button>
              </div>
            </nav>
          </div>}
      </div>
    </header>;
};
export default Header;