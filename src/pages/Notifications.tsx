import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, Trash2, Search, Filter, Briefcase, StickyNote, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow, format } from "date-fns";
import Header from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "job_status", label: "Job Status" },
  { value: "job_note", label: "Job Notes" },
  { value: "invoice_response", label: "Invoice" },
  { value: "quote_response", label: "Quote" },
  { value: "info", label: "General" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case "job_status":
      return <Briefcase className="h-5 w-5 text-primary shrink-0" />;
    case "job_note":
      return <StickyNote className="h-5 w-5 text-primary shrink-0" />;
    case "invoice_response":
      return <FileText className="h-5 w-5 text-destructive shrink-0" />;
    case "quote_response":
      return <FileText className="h-5 w-5 text-accent-foreground shrink-0" />;
    default:
      return <Bell className="h-5 w-5 text-muted-foreground shrink-0" />;
  }
}

function typeLabel(type: string) {
  return TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

export default function Notifications() {
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let list = notifications;
    if (typeFilter !== "all") list = list.filter((n) => n.type === typeFilter);
    if (statusFilter === "unread") list = list.filter((n) => !n.is_read);
    if (statusFilter === "read") list = list.filter((n) => n.is_read);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q)
      );
    }
    return list;
  }, [notifications, typeFilter, statusFilter, search]);

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.reference_type === "job") navigate("/dashboard");
    else if (notif.reference_type === "invoice") navigate("/dashboard?view=invoices");
    else if (notif.reference_type === "issued_quote") navigate("/dashboard?view=quotes");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
                : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <Filter className="h-4 w-4 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">
                {notifications.length === 0 ? "No notifications yet" : "No notifications match your filters"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {filtered.map((notif) => (
              <div
                key={notif.id}
                className={`flex items-start gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors ${
                  !notif.is_read ? "bg-primary/5" : ""
                }`}
                onClick={() => handleClick(notif)}
              >
                <div className="mt-0.5">
                  <NotificationIcon type={notif.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm ${!notif.is_read ? "font-semibold" : ""} text-foreground`}>
                      {notif.title}
                    </p>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {typeLabel(notif.type)}
                    </Badge>
                    {!notif.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(notif.created_at), "MMM d, yyyy 'at' h:mm a")} ·{" "}
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0 mt-1">
                  {!notif.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
