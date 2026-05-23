import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import tradestoneLogo from "@/assets/tradestone-logo-correct.png";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <Link to="/" className="mb-8 transition-transform hover:scale-105">
        <img
          src={tradestoneLogo}
          alt="TradeStone logo"
          className="h-24 w-auto"
        />
      </Link>
      <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground text-center">
        Sorry, we're still finishing this up
      </h1>
      <p className="text-muted-foreground mt-4 text-center">
        Click the logo above to return home
      </p>
    </div>
  );
};

export default NotFound;
