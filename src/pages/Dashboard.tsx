import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { ErrorState } from "@/components/AsyncState";
import Header from "@/components/Header";

type UserType = "personal" | "business" | "contractor";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const redirectToDashboard = async () => {
      setLoadError(null);
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        setLoadError("Unable to validate your account right now.");
        setLoading(false);
        return;
      }

      if (!user) {
        navigate("/login");
        return;
      }

      // Get user profile to determine type
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        setLoadError("We couldn't load your profile. Please try again.");
        setLoading(false);
        return;
      }

      const userType = (profile?.user_type as UserType) || "personal";

      // Redirect based on user type
      switch (userType) {
        case "contractor":
          navigate("/dashboard/contractor", { replace: true });
          break;
        case "business":
          navigate("/dashboard/business", { replace: true });
          break;
        case "personal":
        default:
          navigate("/dashboard/personal", { replace: true });
          break;
      }
    };

    redirectToDashboard();
  }, [navigate]);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
