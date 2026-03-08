import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";

const COOKIE_CONSENT_KEY = "tradestone_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(COOKIE_CONSENT_KEY)) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = (value: "all" | "essential") => {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg mx-4 mb-6 rounded-2xl border border-border bg-card shadow-2xl p-6 animate-in slide-in-from-bottom-8 duration-500">
        <div className="flex items-start gap-3">
          <Cookie className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-card-foreground text-base">We value your privacy</h3>
              <button onClick={() => accept("essential")} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We use cookies to enhance your experience, analyse site traffic, and personalise content. By clicking "Accept All", you consent to our use of cookies as described in our{" "}
              <Link to="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">
                Privacy Policy
              </Link>.
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => accept("all")}>
                Accept All
              </Button>
              <Button size="sm" variant="outline" onClick={() => accept("essential")}>
                Essential Only
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
