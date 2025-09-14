import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Phone, Wrench } from "lucide-react";

interface ContractorCardProps {
  name: string;
  company: string;
  code: string;
  specialties: string[];
  rating: number;
  reviewCount: number;
  location: string;
  image?: string;
  distance?: string;
}

const ContractorCard = ({
  name,
  company,
  code,
  specialties,
  rating,
  reviewCount,
  location,
  image,
  distance
}: ContractorCardProps) => {
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
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-lg leading-tight">{name}</h3>
              <p className="text-sm text-muted-foreground">{company}</p>
            </div>
            <Badge variant="secondary" className="text-xs font-mono">
              TS{code}
            </Badge>
          </div>

          {/* Rating and Location */}
          <div className="flex items-center space-x-4 mb-3 text-sm">
            <div className="flex items-center space-x-1">
              <Star className="h-4 w-4 fill-primary text-primary" />
              <span className="font-medium">{rating}</span>
              <span className="text-muted-foreground">({reviewCount})</span>
            </div>
            <div className="flex items-center space-x-1 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{location}</span>
              {distance && <span>• {distance}</span>}
            </div>
          </div>

          {/* Specialties */}
          <div className="flex flex-wrap gap-1 mb-4">
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

          {/* Actions */}
          <div className="flex space-x-2">
            <Button size="sm" className="flex-1">
              View Profile
            </Button>
            <Button size="sm" variant="outline">
              <Phone className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ContractorCard;