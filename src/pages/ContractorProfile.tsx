import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import QuoteRequestDialog from "@/components/QuoteRequestDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Star, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar, 
  Award, 
  Wrench,
  Clock,
  CheckCircle,
  MessageSquare,
  Share2,
  Heart,
  Camera,
  ThumbsUp
} from "lucide-react";

const ContractorProfile = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(false);
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [contractorProfile, setContractorProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load contractor profile by TS code
  useEffect(() => {
    const loadContractorProfile = async () => {
      if (!code) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('ts_profile_code', code)
          .single();

        if (error || !data) {
          console.error('Contractor not found:', error);
          setContractorProfile(null);
        } else {
          setContractorProfile(data);
        }
      } catch (error) {
        console.error('Error loading contractor profile:', error);
        setContractorProfile(null);
      } finally {
        setLoading(false);
      }
    };

    loadContractorProfile();
  }, [code]);

  // Mock contractor data - will be replaced by real data when profiles are populated
  const contractor = contractorProfile || {
    name: contractorProfile?.full_name || "Mike Johnson",
    company: contractorProfile?.company_name || "Johnson Plumbing Ltd",
    code: code || "A7K9M2",
    user_id: contractorProfile?.user_id || "mock-user-id",
    specialties: ["Plumbing", "Heating", "Boiler Repair", "Emergency Services"],
    rating: 4.8,
    reviewCount: 127,
    location: "Central London",
    phone: "+44 20 7123 4567",
    email: "mike@johnsonplumbing.co.uk",
    image: "",
    verified: true,
    yearsExperience: 12,
    projectsCompleted: 340,
    responseTime: "Within 2 hours",
    availability: "Available this week",
    bio: "Professional plumber with over 12 years of experience serving London. Specializing in residential and commercial plumbing, heating systems, and emergency repairs. Licensed, insured, and committed to quality workmanship.",
    certifications: [
      "Gas Safe Registered",
      "City & Guilds Plumbing",
      "Worcester Bosch Accredited",
      "Vaillant Advance Installer"
    ],
    portfolio: [
      {
        id: 1,
        title: "Bathroom Renovation",
        image: "/placeholder.svg",
        description: "Complete bathroom refurbishment including new suite and tiling"
      },
      {
        id: 2,
        title: "Boiler Installation",
        image: "/placeholder.svg", 
        description: "New Worcester Bosch boiler installation with 10-year warranty"
      },
      {
        id: 3,
        title: "Kitchen Plumbing",
        image: "/placeholder.svg",
        description: "Full kitchen plumbing installation for new build property"
      }
    ],
    reviews: [
      {
        id: 1,
        name: "Sarah Mitchell",
        rating: 5,
        date: "2 days ago",
        comment: "Excellent service! Mike arrived on time, diagnosed the issue quickly, and fixed our leaking boiler. Very professional and reasonably priced."
      },
      {
        id: 2,
        name: "David Thompson", 
        rating: 5,
        date: "1 week ago",
        comment: "Outstanding work on our bathroom renovation. Mike's attention to detail is impressive and he kept everything clean and tidy."
      },
      {
        id: 3,
        name: "Emma Wilson",
        rating: 4,
        date: "2 weeks ago",
        comment: "Good work on the kitchen plumbing. Professional and efficient. Would recommend to others."
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-20">
        {/* Back Navigation */}
        <div className="border-b bg-card/50">
          <div className="container mx-auto max-w-6xl px-4 py-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate(-1)}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Directory
            </Button>
          </div>
        </div>

        {/* Profile Header */}
        <section className="py-8 px-4 bg-gradient-to-br from-card/50 to-muted/30">
          <div className="container mx-auto max-w-6xl">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Avatar and Basic Info */}
              <div className="flex flex-col items-center lg:items-start">
                <Avatar className="w-32 h-32 mb-4">
                  <AvatarImage src={contractor.image} alt={contractor.name} />
                  <AvatarFallback className="text-2xl">
                    <Wrench className="h-12 w-12" />
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="font-mono">
                    TS{contractor.code}
                  </Badge>
                  {contractor.verified && (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="hero-gradient">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setIsLiked(!isLiked)}
                  >
                    <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Main Info */}
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-3xl font-bold mb-2">{contractor.name}</h1>
                    <p className="text-xl text-muted-foreground mb-4">{contractor.company}</p>
                  </div>
                </div>

                {/* Rating and Location */}
                <div className="flex flex-wrap items-center gap-6 mb-6">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 fill-primary text-primary" />
                    <span className="font-semibold text-lg">{contractor.rating}</span>
                    <span className="text-muted-foreground">({contractor.reviewCount} reviews)</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-5 w-5" />
                    <span>{contractor.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-5 w-5" />
                    <span>{contractor.responseTime}</span>
                  </div>
                </div>

                {/* Specialties */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {contractor.specialties.map((specialty, index) => (
                    <Badge key={index} variant="outline">
                      {specialty}
                    </Badge>
                  ))}
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-primary">{contractor.yearsExperience}</div>
                    <div className="text-sm text-muted-foreground">Years Experience</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-primary">{contractor.projectsCompleted}</div>
                    <div className="text-sm text-muted-foreground">Projects Completed</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-primary">{contractor.rating}</div>
                    <div className="text-sm text-muted-foreground">Average Rating</div>
                  </Card>
                  <Card className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">Available</div>
                    <div className="text-sm text-muted-foreground">This Week</div>
                  </Card>
                </div>

                {/* Contact Actions */}
                <div className="flex flex-wrap gap-3">
                  <Button size="lg" className="hero-gradient">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline"
                    onClick={() => setIsQuoteDialogOpen(true)}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Request Quote
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Profile Content Tabs */}
        <section className="py-8 px-4">
          <div className="container mx-auto max-w-6xl">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card className="p-6">
                  <h3 className="text-xl font-semibold mb-4">About</h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    {contractor.bio}
                  </p>
                  
                  <h4 className="font-semibold mb-3">Certifications & Accreditations</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {contractor.certifications.map((cert, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" />
                        <span>{cert}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="portfolio" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {contractor.portfolio.map((project) => (
                    <Card key={project.id} className="overflow-hidden hover:shadow-lg transition-tradestone">
                      <div className="aspect-video bg-muted flex items-center justify-center">
                        <Camera className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <div className="p-4">
                        <h4 className="font-semibold mb-2">{project.title}</h4>
                        <p className="text-sm text-muted-foreground">{project.description}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="reviews" className="space-y-6">
                <div className="space-y-4">
                  {contractor.reviews.map((review) => (
                    <Card key={review.id} className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h4 className="font-semibold">{review.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex">
                              {Array.from({ length: review.rating }).map((_, i) => (
                                <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                              ))}
                            </div>
                            <span className="text-sm text-muted-foreground">{review.date}</span>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost">
                          <ThumbsUp className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-muted-foreground">{review.comment}</p>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="contact" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="p-6">
                    <h3 className="text-xl font-semibold mb-4">Get in Touch</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium">Send Message</div>
                          <div className="text-sm text-muted-foreground">Secure messaging via TradeStone</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium">Request Quote</div>
                          <div className="text-sm text-muted-foreground">Get detailed project estimates</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium">{contractor.location}</div>
                          <div className="text-sm text-muted-foreground">Service area</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        All communications are handled securely through TradeStone to protect both parties and maintain quality standards.
                      </p>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-xl font-semibold mb-4">Availability</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span>Response Time</span>
                        <Badge variant="secondary">{contractor.responseTime}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Current Status</span>
                        <Badge className="bg-green-500">{contractor.availability}</Badge>
                      </div>
                      <Separator />
                      <Button className="w-full hero-gradient">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Send Message
                      </Button>
                    </div>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      {/* Quote Request Dialog */}
      <QuoteRequestDialog
        isOpen={isQuoteDialogOpen}
        onClose={() => setIsQuoteDialogOpen(false)}
        contractorId={contractor.user_id}
        contractorName={contractor.name}
      />
    </div>
  );
};

export default ContractorProfile;