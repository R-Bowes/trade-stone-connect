import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, Trash2, Briefcase, StickyNote, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case "job_status":
      return <Briefcase className="h-4 w-4 text-primary shrink-0" />;
    case "job_note":
      return <StickyNote className="h-4 w-4 text-primary shrink-0" />;
    case "invoice_response":
      return <FileText className="h-4 w-4 text-destructive shrink-0" />;
    case "quote_response":
      return <FileText className="h-4 w-4 text-secondary shrink-0" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.reference_type === "enquiry") {
      navigate("/dashboard/contractor");
    } else if (notif.reference_type === "job") {
      navigate("/dashboard");
    } else if (notif.reference_type === "invoice") {
      navigate("/dashboard?view=invoices");
    } else if (notif.reference_type === "issued_quote" || notif.reference_type === "quote") {
      navigate("/dashboard");
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 text-[10px] font-bold bg-destructive text-destructive-foreground border-2 border-background"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 pb-2">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No notifications yet
            </div>
          ) : (
            <div>
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    !notif.is_read ? "bg-primary/5" : ""
                  }`}
                  onClick={() => handleClick(notif)}
                >
                  <NotificationIcon type={notif.type} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-tight ${!notif.is_read ? "font-semibold" : ""}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!notif.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                        title="Mark as read"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <Separator />
        <div className="p-2 text-center">
          <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => { setOpen(false); navigate("/notifications"); }}>
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
