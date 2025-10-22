import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Star, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface Photo {
  id: string;
  photo_url: string;
  title: string;
  description: string;
  project_name: string;
  is_featured: boolean;
}

export function PhotoGallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPhoto, setNewPhoto] = useState({
    photo_url: "",
    title: "",
    description: "",
    project_name: "",
    is_featured: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("contractor_photos")
        .select("*")
        .eq("contractor_id", user.id)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error) {
      console.error("Error loading photos:", error);
      toast({
        title: "Error",
        description: "Failed to load photos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhoto = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("contractor_photos").insert({
        contractor_id: user.id,
        ...newPhoto,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Photo added successfully",
      });

      setDialogOpen(false);
      setNewPhoto({
        photo_url: "",
        title: "",
        description: "",
        project_name: "",
        is_featured: false,
      });
      loadPhotos();
    } catch (error) {
      console.error("Error adding photo:", error);
      toast({
        title: "Error",
        description: "Failed to add photo",
        variant: "destructive",
      });
    }
  };

  const handleDeletePhoto = async (id: string) => {
    try {
      const { error } = await supabase
        .from("contractor_photos")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Photo deleted successfully",
      });
      loadPhotos();
    } catch (error) {
      console.error("Error deleting photo:", error);
      toast({
        title: "Error",
        description: "Failed to delete photo",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Photo Gallery</h2>
          <p className="text-muted-foreground">Manage your project photos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Photo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Photo</DialogTitle>
              <DialogDescription>Add a new photo to your gallery</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="photo_url">Photo URL</Label>
                <Input
                  id="photo_url"
                  value={newPhoto.photo_url}
                  onChange={(e) => setNewPhoto({ ...newPhoto, photo_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newPhoto.title}
                  onChange={(e) => setNewPhoto({ ...newPhoto, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={newPhoto.description}
                  onChange={(e) => setNewPhoto({ ...newPhoto, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project_name">Project Name</Label>
                <Input
                  id="project_name"
                  value={newPhoto.project_name}
                  onChange={(e) => setNewPhoto({ ...newPhoto, project_name: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_featured"
                  checked={newPhoto.is_featured}
                  onCheckedChange={(checked) => setNewPhoto({ ...newPhoto, is_featured: checked as boolean })}
                />
                <Label htmlFor="is_featured">Featured Photo</Label>
              </div>
              <Button onClick={handleAddPhoto} className="w-full">
                Add Photo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {photos.map((photo) => (
          <Card key={photo.id}>
            <CardHeader className="relative p-0">
              <img
                src={photo.photo_url}
                alt={photo.title}
                className="w-full h-48 object-cover rounded-t-lg"
              />
              {photo.is_featured && (
                <Star className="absolute top-2 right-2 h-6 w-6 fill-yellow-400 text-yellow-400" />
              )}
            </CardHeader>
            <CardContent className="p-4">
              <h3 className="font-semibold">{photo.title}</h3>
              <p className="text-sm text-muted-foreground">{photo.description}</p>
              {photo.project_name && (
                <p className="text-sm text-muted-foreground mt-1">
                  Project: {photo.project_name}
                </p>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="mt-2"
                onClick={() => handleDeletePhoto(photo.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}