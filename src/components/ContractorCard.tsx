import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Heart, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAvailability } from "@/hooks/useAvailability";
import { format, isToday, isTomorrow } from "date-fns";

interface ContractorCardProps {
  name: string;
  company: string;
  code: string;
  profileId: string;
  specialties: string[];
  bioSnippet?: string;
  rating?: number | null;
  reviewCount?: number | null;
  location: string;
  image?: string;
  isVerified?: boolean;
}

function NextAvailableBadge({ profileId }: { profileId: string }) {
  const { getNextAvailable, loading } = useAvailability(profileId);

  if (loading) return null;

  const next = getNextAvailable();
  if (!next) return (
    <Badge variant="outline" className="text-xs">Contact for availability</Badge>
  );

  let label = "";
  if (isToday(next)) label = "Available today";
  else if (isTomorrow(next)) label = "Available tomorrow";
  else label = `Available ${format(next, "EEE d MMM")}`;

  const isImmediate = isToday(next) || isTomorrow(next);

  return (
    <Badge
      variant="outline"
      className={`text-xs ${isImmediate ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}
    >
      {label}
    </Badge>
  );
}

const ContractorCard = ({
  name,
  company,
  code,
  profileId,
  specialties,
  bioSnippet,
  rating,
  reviewCount,
  location,
  image,
  isVerified,
}: ContractorCardProps) => {
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(false);

  const handleViewProfile = () => {
    navigate(`/contractor/${code}`);
  };

  return (
    <Card className="contractor-card">
      <div className="flex items-start space-x-4">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          {image ? (
            <img
              src={image}
              alt={name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <Wrench className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1 gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-lg leading-tight truncate">{name}</h3>
              <p className="text-sm text-muted-foreground truncate">{company}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant="secondary" className="text-xs font-mono">{code}</Badge>
              {isVerified && (
                <Badge className="text-xs bg-green-500 text-white">Verified</Badge>
              )}
            </div>
          </div>

          {/* Rating and Location */}
          <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
            {rating != null ? (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-primary text-primary" />
                <span className="font-medium">{rating}</span>
                {reviewCount != null && reviewCount > 0 && (
                  <span className="text-muted-foreground">({reviewCount})</span>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No reviews yet</span>
            )}
            {location && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{location}</span>
              </div>
            )}
          </div>

          {/* Specialties */}
          <div className="flex flex-wrap gap-1 mb-3">
            {specialties.slice(0, 3).map((specialty, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {specialty}
              </Badge>
            ))}
            {specialties.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{specialties.length - 3} more
              </Badge>
            )}
          </div>

          {bioSnippet && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{bioSnippet}</p>
          )}

          {/* Availability */}
          <div className="mb-3">
            <NextAvailableBadge profileId={profileId} />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleViewProfile}>
              View Profile
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsLiked(!isLiked)}
            >
              <Heart className={`h-4 w-4 ${isLiked ? "fill-red-500 text-red-500" : ""}`} />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ContractorCard;