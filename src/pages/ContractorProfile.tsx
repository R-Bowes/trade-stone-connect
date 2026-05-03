import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import QuoteRequestDialog from "@/components/QuoteRequestDialog";
import { ContractorMessageDialog } from "@/components/ContractorMessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useAvailability } from "@/hooks/useAvailability";
import { format, isToday, isTomorrow } from "date-fns";
import {
  ArrowLeft,
  Star,
  MapPin,
  Calendar,
  Wrench,
  Clock,
  CheckCircle,
  MessageSquare,
  Share2,
  Heart,
  Camera,
  FileText,
  ExternalLink,
} from "lucide-react";

type ContractorProfileData = {
  id: string;
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
  user_type: "personal" | "business" | "contractor";
  trades: string[] | null;
  location: string | null;
  working_radius: string | null;
  bio: string | null;
  logo_url: string | null;
  is_verified: boolean | null;
  rating: number | null;
  review_count: number | null;
  years_experience: number | null;
  completed_jobs: number | null;
  created_at: string;
  updated_at: string;
};

function formatNextAvailable(date: Date | null): string {
  if (!date) return "Contact for availability";
  if (isToday(date)) return "Available today";
  if (isTomorrow(date)) return "Available tomorrow";
  return `Available from ${format(date, "EEE d MMM")}`;
}

const ContractorProfile = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(false);
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  const [contractorProfile, setContractorProfile] = useState<ContractorProfileData | null>(null);
  const [contractorDocuments, setContractorDocuments] = useState<Array<{
    id: string;
    title: string;
    description: string | null;
    document_url: string;
    file_name: string;
    file_size: number | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContractorProfile = async () => {
      if (!code) return;
      try {
        const { data, error } = await supabase
          .from("public_pro_profiles")
          .select("id, user_id, full_name, company_name, ts_profile_code, user_type, trades, location, working_radius, bio, logo_url, is_verified, rating, review_count, years_experience, completed_jobs, created_at, updated_at")
          .eq("ts_profile_code", code)
          .maybeSingle();
        if (error || !data) {
          setContractorProfile(null);
        } else {
          setContractorProfile(data);
          const { data: docs } = await supabase
            .from("contractor_documents")
            .select("id, title, description, document_url, file_name, file_size")
            .eq("contractor_id", data.id)
            .order("display_order", { ascending: true });
          setContractorDocuments(docs || []);
        }
      } catch {
        setContractorProfile(null);
      } finally {
        setLoading(false);
      }
    };
    loadContractorProfile();
  }, [code]);

  const { getNextAvailable, loading: availabilityLoading } = useAvailability(contractorProfile?.id ?? "");
  const nextAvailableDate = contractorProfile?.id ? getNextAvailable() : null;
  const nextAvailableLabel = formatNextAvailable(nextAvailableDate);
  const isAvailable = nextAvailableDate !== null;

  const openMessageFlow = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }
    if (!contractorProfile?.user_id) return;
    setIsMessageDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  if (!contractorProfile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20 flex items-center justify-center">
          <p className="text-muted-foreground">Contractor not found.</p>
        </main>
      </div>
    );
  }

  const displayName = contractorProfile.full_name || "Unknown";
  const displayCompany = contractorProfile.company_name || "";
  const displayCode = contractorProfile.ts_profile_code || code || "";
  const displayTrades = contractorProfile.trades && contractorProfile.trades.length > 0 ? contractorProfile.trades : [];
  const displayBio = contractorProfile.bio || "";
  const displayLocation = contractorProfile.location || "";
  const displayRadius = contractorProfile.working_radius || "";
  const displayRating = contractorProfile.rating;
  const displayReviewCount = contractorProfile.review_count;
  const displayYearsExp = contractorProfile.years_experience;
  const displayCompletedJobs = contractorProfile.completed_jobs;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20">
        <div className="border-b bg-card/50">
          <div className="container mx-auto max-w-6xl px-4 py-4">
            <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Directory
            </Button>
          </div>
        </div>

        <section className="py-8 px-4 bg-gradient-to-br from-card/50 to-muted/30">
          <div className="container mx-auto max-w-6xl">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex flex-col items-center lg:items-start">
                <Avatar className="w-32 h-32 mb-4">
                  <AvatarImage src={contractorProfile.logo_url || ""} alt={displayName} />
                  <AvatarFallback className="text-2xl">
                    <Wrench className="h-12 w-12" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="font-mono">{displayCode}</Badge>
                  {contractorProfile.is_verified && (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="hero-gradient" onClick={() => void openMessageFlow()} disabled={!contractorProfile.user_id}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsLiked(!isLiked)}>
                    <Heart className={`h-4 w-4 ${isLiked ? "fill-red-500 text-red-500" : ""}`} />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-1">{displayName}</h1>
                {displayCompany && <p className="text-xl text-muted-foreground mb-4">{displayCompany}</p>}

                <div className="flex flex-wrap items-center gap-6 mb-6">
                  {displayRating !== null ? (
                    <div className="flex items-center gap-2">
                      <Star className="h-5 w-5 fill-primary text-primary" />
                      <span className="font-semibold text-lg">{displayRating.toFixed(1)}</span>
                      {displayReviewCount !== null && (
                        <span className="text-muted-foreground">({displayReviewCount} review{displayReviewCount !== 1 ? "s" : ""})</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">No reviews yet</span>
                  )}
                  {displayLocation && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-5 w-5" />
                      <span>{displayLocation}</span>
                    </div>
                  )}
                </div>

                {displayTrades.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {displayTrades.map((trade, i) => (
                      <Badge key={i} variant="outline">{trade}</Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card className="p-4 text-center">
                    {displayYearsExp !== null ? (
                      <><div className="text-2xl font-bold text-primary">{displayYearsExp}</div><div className="text-sm text-muted-foreground">Years Experience</div></>
                    ) : (
                      <><div className="text-sm font-medium text-muted-foreground">Not set</div><div className="text-sm text-muted-foreground">Years Experience</div></>
                    )}
                  </Card>
                  <Card className="p-4 text-center">
                    {displayCompletedJobs !== null ? (
                      <><div className="text-2xl font-bold text-primary">{displayCompletedJobs}</div><div className="text-sm text-muted-foreground">Jobs Completed</div></>
                    ) : (
                      <><div className="text-sm font-medium text-muted-foreground">Not set</div><div className="text-sm text-muted-foreground">Jobs Completed</div></>
                    )}
                  </Card>
                  <Card className="p-4 text-center">
                    {displayRating !== null ? (
                      <><div className="text-2xl font-bold text-primary">{displayRating.toFixed(1)}</div><div className="text-sm text-muted-foreground">Average Rating</div></>
                    ) : (
                      <><div className="text-sm font-medium text-muted-foreground">No reviews</div><div className="text-sm text-muted-foreground">Average Rating</div></>
                    )}
                  </Card>
                  <Card className="p-4 text-center">
                    {availabilityLoading ? (
                      <><div className="text-sm font-medium text-muted-foreground animate-pulse">Checking...</div><div className="text-sm text-muted-foreground">Availability</div></>
                    ) : (
                      <><div className={`text-sm font-bold ${isAvailable ? "text-green-600" : "text-muted-foreground"}`}>{nextAvailableLabel}</div><div className="text-sm text-muted-foreground">Availability</div></>
                    )}
                  </Card>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button size="lg" className="hero-gradient" onClick={() => void openMessageFlow()} disabled={!contractorProfile.user_id}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setIsQuoteDialogOpen(true)}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Request Quote
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 px-4">
          <div className="container mx-auto max-w-6xl">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card className="p-6">
                  <h3 className="text-xl font-semibold mb-4">About</h3>
                  {displayBio ? (
                    <p className="text-muted-foreground leading-relaxed">{displayBio}</p>
                  ) : (
                    <p className="text-muted-foreground italic">No bio added yet.</p>
                  )}
                  {displayRadius && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>Works within {displayRadius} of {displayLocation || "base location"}</span>
                    </div>
                  )}
                </Card>
                <Card className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Availability</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span>Next available</span>
                      {availabilityLoading ? (
                        <Badge variant="outline" className="animate-pulse">Checking...</Badge>
                      ) : (
                        <Badge className={isAvailable ? "bg-green-500" : ""} variant={isAvailable ? "default" : "outline"}>
                          {nextAvailableLabel}
                        </Badge>
                      )}
                    </div>
                    <Separator />
                    <Button className="w-full hero-gradient" onClick={() => void openMessageFlow()} disabled={!contractorProfile.user_id}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Send Message
                    </Button>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="portfolio" className="space-y-6">
                <Card className="p-6 text-center text-muted-foreground">
                  <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No portfolio images uploaded yet.</p>
                </Card>
              </TabsContent>

              <TabsContent value="documents" className="space-y-6">
                {contractorDocuments.length === 0 ? (
                  <Card className="p-6 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No documents have been uploaded yet.</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {contractorDocuments.map((doc) => (
                      <Card key={doc.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{doc.title}</p>
                              {doc.description && (
                                <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
                              )}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" asChild>
                            <a href={doc.document_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View
                            </a>
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reviews" className="space-y-6">
                <Card className="p-6 text-center text-muted-foreground">
                  <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No reviews yet.</p>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      <QuoteRequestDialog
        isOpen={isQuoteDialogOpen}
        onClose={() => setIsQuoteDialogOpen(false)}
        contractorId={contractorProfile.id}
        contractorName={displayName}
      />

      {contractorProfile.user_id && (
        <ContractorMessageDialog
          open={isMessageDialogOpen}
          onOpenChange={setIsMessageDialogOpen}
          recipientUserId={contractorProfile.user_id}
          contractorName={displayName}
          contractorLocation={displayLocation}
        />
      )}
    </div>
  );
};

export default ContractorProfile;
