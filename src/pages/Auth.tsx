import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { TransactionFeeNotice } from "@/components/TransactionFeeNotice";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const quickTestPassword = "TradeStoneDev#9pV";

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [userType, setUserType] = useState<"personal" | "business" | "contractor">("personal");
  const [companyName, setCompanyName] = useState("");

  // Captcha state
  const [captchaToken, setCaptchaToken] = useState("");
  const [isCaptchaReady, setIsCaptchaReady] = useState(false);
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const captchaWidgetIdRef = useRef<string | number | null>(null);

  const configuredCaptchaSiteKey = import.meta.env.VITE_SUPABASE_CAPTCHA_SITE_KEY as string | undefined;
  const captchaSiteKey = configuredCaptchaSiteKey?.trim();
  const captchaEnabled = Boolean(captchaSiteKey && captchaSiteKey !== "your-captcha-site-key");

  // Provider selection:
  // - If VITE_SUPABASE_CAPTCHA_PROVIDER is set, use it.
  // - Otherwise, auto-detect hCaptcha when the key looks like a UUID.
  // - Fallback to turnstile.
  const configuredCaptchaProvider = import.meta.env.VITE_SUPABASE_CAPTCHA_PROVIDER as string | undefined;

  const isLikelyHCaptchaSiteKey = Boolean(
    captchaSiteKey &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(captchaSiteKey)
  );

  const captchaProvider = (configuredCaptchaProvider ?? (isLikelyHCaptchaSiteKey ? "hcaptcha" : "turnstile")) as
    | "hcaptcha"
    | "turnstile";

  const captchaScriptSrc =
    captchaProvider === "hcaptcha"
      ? "https://js.hcaptcha.com/1/api.js?render=explicit"
      : "https://challenges.cloudflare.com/turnstile/v0/api.js";

  const accountTypeDetails: Record<"personal" | "business" | "contractor", { title: string; description: string }> = {
    personal: {
      title: "Personal",
      description: "For homeowners and individuals requesting quotes, booking services, and managing project communication.",
    },
    business: {
      title: "Business",
      description: "For companies and property managers coordinating jobs across multiple locations or teams.",
    },
    contractor: {
      title: "Contractor",
      description: "For trade professionals and service providers showcasing services, sending quotes, and managing client work.",
    },
  };

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        navigate("/");
      }
    };
    checkUser();
  }, [navigate]);

  useEffect(() => {
    if (!captchaEnabled || !captchaContainerRef.current) return;

    setIsCaptchaReady(false);

    const renderWidget = () => {
      if (!captchaContainerRef.current || captchaWidgetIdRef.current !== null) return;

      const baseOptions: any = {
        sitekey: captchaSiteKey,
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(""),
        "error-callback": () => setCaptchaToken(""),
      };

      if (captchaProvider === "hcaptcha") {
        if (!window.hcaptcha) return;
        captchaWidgetIdRef.current = window.hcaptcha.render(captchaContainerRef.current, baseOptions);
        setIsCaptchaReady(true);
        return;
      }

      if (!window.turnstile) return;
      captchaWidgetIdRef.current = window.turnstile.render(captchaContainerRef.current, baseOptions);
      setIsCaptchaReady(true);
    };

    // If already available, render immediately.
    if (
      (captchaProvider === "hcaptcha" && (window as any).hcaptcha) ||
      (captchaProvider !== "hcaptcha" && (window as any).turnstile)
    ) {
      renderWidget();
      return;
    }

    // If script already exists, it might have loaded before this effect attached listeners.
    // Try rendering immediately and keep a short retry loop until provider globals are ready.
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${captchaScriptSrc}"]`);

    if (existingScript) {
      renderWidget();
      existingScript.addEventListener("load", renderWidget);
      const pollId = window.setInterval(() => {
        if (captchaWidgetIdRef.current !== null) {
          window.clearInterval(pollId);
          return;
        }
        renderWidget();
      }, 250);

      const stopPolling = window.setTimeout(() => window.clearInterval(pollId), 5000);

      return () => {
        existingScript.removeEventListener("load", renderWidget);
        window.clearInterval(pollId);
        window.clearTimeout(stopPolling);
      };
    }

    const script = document.createElement("script");
    script.src = captchaScriptSrc;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", renderWidget);
    document.head.appendChild(script);

    return () => script.removeEventListener("load", renderWidget);
  }, [captchaEnabled, captchaProvider, captchaScriptSrc, captchaSiteKey]);

  const resetCaptcha = () => {
    setCaptchaToken("");

    if (captchaWidgetIdRef.current === null) return;

    if (captchaProvider === "hcaptcha" && (window as any).hcaptcha) {
      (window as any).hcaptcha.reset(captchaWidgetIdRef.current);
      return;
    }

    if ((window as any).turnstile) {
      (window as any).turnstile.reset(captchaWidgetIdRef.current);
    }
  };

  const shouldValidateCaptcha = captchaEnabled && isCaptchaReady;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (shouldValidateCaptcha && !captchaToken) {
      toast({
        variant: "destructive",
        title: "Captcha required",
        description: "Please complete the captcha verification before logging in.",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
        options: {
          captchaToken: captchaToken || undefined,
        },
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: error.message,
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have been logged in successfully.",
        });
        navigate("/");
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      if (shouldValidateCaptcha) resetCaptcha();
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (shouldValidateCaptcha && !captchaToken) {
      toast({
        variant: "destructive",
        title: "Captcha required",
        description: "Please complete the captcha verification before creating an account.",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          captchaToken: captchaToken || undefined,
          data: {
            full_name: fullName,
            user_type: userType,
            company_name: companyName,
          },
        },
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Signup failed",
          description: error.message,
        });
      } else {
        toast({
          title: "Account created!",
          description: "Please check your email to verify your account.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      if (shouldValidateCaptcha) resetCaptcha();
      setLoading(false);
    }
  };

  // Quick test login function
  const handleQuickLogin = async (email: string, password: string, type: "personal" | "business" | "contractor") => {
    setLoading(true);
    const nameMap = { personal: "Personal Test User", business: "Business Test User", contractor: "Contractor Test User" };

    try {
      // First try to sign up the test user
      await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: nameMap[type],
            user_type: type,
            company_name: type !== "personal" ? "Test Company" : "",
          },
        },
      });

      // Then sign in
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error && !error.message.includes("Invalid login credentials")) {
        toast({
          variant: "destructive",
          title: "Test login failed",
          description: error.message,
        });
      } else {
        toast({
          title: `${type.toUpperCase()} Test User Login`,
          description: `Logged in as ${type} user for testing.`,
        });
        navigate("/");
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-center mb-2">Welcome to TradeStone</h1>
            <p className="text-muted-foreground text-center">Sign in or create your account</p>
          </div>

          {/* Quick Test Buttons - Development Only */}
          {import.meta.env.DEV && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Quick Test Login</CardTitle>
                <CardDescription>Development only - not visible in production</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => handleQuickLogin("contractor@test.com", quickTestPassword, "contractor")}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  Login as Contractor
                </Button>
                <Button
                  onClick={() => handleQuickLogin("business@test.com", quickTestPassword, "business")}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  Login as Business
                </Button>
                <Button
                  onClick={() => handleQuickLogin("personal@test.com", quickTestPassword, "personal")}
                  disabled={loading}
                  variant="outline"
                  className="w-full"
                >
                  Login as Personal
                </Button>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {captchaEnabled && (
              <div className="py-4">
                <div ref={captchaContainerRef} />
              </div>
            )}

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Login</CardTitle>
                  <CardDescription>Enter your credentials to access your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="loginEmail">Email</Label>
                      <Input
                        id="loginEmail"
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loginPassword">Password</Label>
                      <Input
                        id="loginPassword"
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="signup">
              <Card>
                <CardHeader>
                  <CardTitle>Create Account</CardTitle>
                  <CardDescription>Join TradeStone today</CardDescription>
                </CardHeader>
                <CardContent>
                  <TransactionFeeNotice className="mb-4" />
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signupEmail">Email</Label>
                      <Input
                        id="signupEmail"
                        type="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signupPassword">Password</Label>
                      <Input
                        id="signupPassword"
                        type="password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="userType">Account Type</Label>

                      <div className="space-y-2 rounded-md border p-3 text-sm">
                        {Object.entries(accountTypeDetails).map(([key, details]) => (
                          <p
                            key={key}
                            className={userType === key ? "font-medium text-foreground" : "text-muted-foreground"}
                          >
                            <span className="font-semibold">{details.title}:</span> {details.description}
                          </p>
                        ))}
                      </div>

                      <Select
                        value={userType}
                        onValueChange={(value: "personal" | "business" | "contractor") => setUserType(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">Personal</SelectItem>
                          <SelectItem value="business">Business</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(userType === "business" || userType === "contractor") && (
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                        />
                      </div>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Auth;
