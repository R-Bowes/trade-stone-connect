import { cn } from "@/lib/utils";

interface TeamAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg"; // sm=28px, md=48px, lg=120px
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<TeamAvatarProps["size"]>, string> = {
  sm: "h-7 w-7",
  md: "h-12 w-12",
  lg: "h-[120px] w-[120px]",
};

const TEXT_CLASS: Record<NonNullable<TeamAvatarProps["size"]>, string> = {
  sm: "text-xs",
  md: "text-lg",
  lg: "text-4xl",
};

export function TeamAvatar({ name, photoUrl, size = "md", className }: TeamAvatarProps) {
  const dimension = SIZE_CLASS[size];

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn(dimension, "shrink-0 rounded-full border border-border bg-white object-cover", className)}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={cn(
        dimension,
        TEXT_CLASS[size],
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: "#1a2744" }}
    >
      {initial}
    </div>
  );
}
