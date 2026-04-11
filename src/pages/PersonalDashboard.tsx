import { useState, useEffect, useMemo } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Heart,
  Clock,
  Search,
  MessageCircle,
  Star,
  Building,
  Loader2,
  ExternalLink,
  Plus,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import Header from "@/components/Header";
import { ReceivedInvoices } from "@/components/recipient/ReceivedInvoices";
import { ReceivedQuotes } from "@/components/recipient/ReceivedQuotes";
import { ClientJobsView } from "@/components/management/ClientJobsView";
import { EmptyState, ErrorState, LoadingState } from "@/components/AsyncState";

const MAX_PHOTOS = 3;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const PersonalDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  // useMemo must be called unconditionally — before any early returns
  const stats = useMemo(
    () => [
      {
        title: "Saved Contractors",
        value: "0",
        icon: Heart,
        description: "Contractors you've bookmarked",
      },
      {
        title: "Active Projects",
        value: "0",
        icon: Clock,
        description: "Projects in progress",
      },
      {
        title: "Reviews Given",
        value: "0",
        icon: Star,
        description: "Feedback you've provided",
      },
    ],
    []
  );

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setLocation("");
    setPhotos([]);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoadError(null);
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        setLoadError("Unable to validate your account.");
        setLoading(false);
        return;
      }

      if (!currentUser) {
        navigate("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (profileError) {
        setLoadError("Unable to load your profile.");
        setLoading(false);
        return;
      }

      if (profile?.user_type && profile.user_type !== "personal") {
        navigate(`/dashboard/${profile.user_type}`);
        return;
      }

      setUser(currentUser);
      setLoading(false);
    };

    loadData();
  }, [navigate]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <LoadingState message="Loading your dashboard..." />
      </div>
    );
  }

  const handlePhotoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      setPhotos([]);
      return;
    }

    if (selectedFiles.length > MAX_PHOTOS) {
      setFormError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const invalidFile = selectedFiles.find((file) => !ALLOWED_IMAGE_TYPES.includes(file.type));
    if (invalidFile) {
      setFormError("Only JPG, PNG, WEBP, and HEIC images are allowed.");
      return;
    }

    const tooLarge = selectedFiles.find((file) => file.size > 8 * 1024 * 1024);
    if (tooLarge) {
      setFormError("Each image must be 8MB or smaller.");
      return;
    }

    setFormError(null);
    setPhotos(selectedFiles);
  };

  const handleSubmitEnquiry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      setFormError("You need to be signed in to submit an enquiry.");
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedLocation = location.trim();

    if (!trimmedTitle || !trimmedDescription || !trimmedLocation) {
      setFormError("Please complete title, description, and postcode before submitting.");
      return;
    }

    if (photos.length > MAX_PHOTOS) {
      setFormError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const { data: insertedEnquiry, error: insertError } = await supabase
        .from("enquiries")
        .insert({
          homeowner_id: user.id,
          title: trimmedTitle,
          description: trimmedDescription,
          location: trimmedLocation,
          status: "new",
        })
        .select("id")
        .single();

      if (insertError || !insertedEnquiry?.id) {
        throw new Error(insertError?.message ?? "Failed to create enquiry.");
      }

      const enquiryId = insertedEnquiry.id;
      const uploadedPaths: string[] = [];

      for (const file of photos) {
        const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${enquiryId}/${Date.now()}-${sanitizedFilename}`;

        const { error: uploadError } = await supabase.storage
          .from("enquiry-photos")
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          throw new Error(`Image upload failed for ${file.name}: ${uploadError.message}`);
        }

        uploadedPaths.push(filePath);
      }

      if (uploadedPaths.length > 0) {
        const { error: updateError } = await supabase
          .from("enquiries")
          .update({ enquiry_photo_paths: uploadedPaths })
          .eq("id", enquiryId)
          .eq("homeowner_id", user.id);

        if (updateError) {
          throw new Error(`Enquiry was created, but photo links could not be saved: ${updateError.message}`);
        }
      }

      setFormSuccess("Your enquiry has been submitted successfully.");
      resetForm();

      toast({
        title: "Enquiry submitted",
        description: "Your enquiry is now visible to contractors.",
      });
    } catch (error) {
      console.error("Error submitting enquiry:", error);
      const message = error instanceof Error ? error.message : "Failed to submit enquiry. Please try again.";
      setFormError(message);
      toast({
        title: "Submission failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Dashboard</h1>
          <p className="text-muted-foreground">Track your project requests and manage your saved contractors.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-7 max-w-3xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="jobs">My Jobs</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
            <TabsTrigger value="requests">My Requests</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stats.map((stat, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Find a Contractor
                  </CardTitle>
                  <CardDescription>Browse verified professionals in your area</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link to="/contractors">
                      Browse Directory
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Materials Marketplace
                  </CardTitle>
                  <CardDescription>Find surplus materials at great prices</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/marketplace">
                      Browse Marketplace
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>Complete these steps to make the most of TradeStone</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Browse the Contractor Directory</p>
                      <p className="text-sm text-muted-foreground">Find verified tradespeople for your project</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/contractors">Go</Link>
                    </Button>
                  </div>

                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Create an Enquiry</p>
                      <p className="text-sm text-muted-foreground">Describe your project and share photos with contractors</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("requests")}>Start</Button>
                  </div>

                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Save Your Favourites</p>
                      <p className="text-sm text-muted-foreground">Bookmark contractors for easy access later</p>
                    </div>
                    <Badge variant="outline">Coming Soon</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-6">
            <ClientJobsView />
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <ReceivedInvoices />
          </TabsContent>

          <TabsContent value="quotes" className="space-y-6">
            <ReceivedQuotes />
          </TabsContent>

          <TabsContent value="requests" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">My Enquiries</h2>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Submit a New Enquiry</CardTitle>
                <CardDescription>
                  Tell contractors what you need. Include a title, project details, postcode, and up to three photos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmitEnquiry}>
                  {formSuccess && (
                    <Alert className="border-green-200 bg-green-50 text-green-900">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertTitle>Submitted</AlertTitle>
                      <AlertDescription>{formSuccess}</AlertDescription>
                    </Alert>
                  )}

                  {formError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Could not submit enquiry</AlertTitle>
                      <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="enquiry-title">Title</Label>
                    <Input
                      id="enquiry-title"
                      placeholder="Kitchen extension and flooring"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="enquiry-description">Description</Label>
                    <Textarea
                      id="enquiry-description"
                      placeholder="Describe the work, timeline, and any constraints."
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={5}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="enquiry-location">Postcode</Label>
                    <Input
                      id="enquiry-location"
                      placeholder="SW1A 1AA"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      maxLength={16}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="enquiry-photos">Photos (optional, up to 3)</Label>
                    <Input
                      id="enquiry-photos"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      multiple
                      onChange={handlePhotoSelection}
                    />
                    <p className="text-sm text-muted-foreground">Allowed: JPG, PNG, WEBP, HEIC. Maximum 8MB per photo.</p>
                    {photos.length > 0 && (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {photos.map((photo) => (
                          <li key={photo.name} className="flex items-center gap-2">
                            <ImageIcon className="h-3.5 w-3.5" />
                            {photo.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isSubmitting ? "Submitting..." : "Submit Enquiry"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="saved" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Saved Contractors</h2>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Saved Contractors</h3>
                <p className="text-muted-foreground mb-4">Save contractors to quickly access their profiles later.</p>
                <Button asChild>
                  <Link to="/contractors">
                    <Search className="mr-2 h-4 w-4" />
                    Browse Directory
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Messages</h2>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Messages</h3>
                <p className="text-muted-foreground mb-4">Your conversations with contractors will appear here.</p>
                <Badge variant="outline">Messaging Coming Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default PersonalDashboard;
