"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const REGIONS = [
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "ca", label: "Canada" },
  { value: "au", label: "Australia" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "es", label: "Spain" },
  { value: "it", label: "Italy" },
  { value: "br", label: "Brazil" },
  { value: "in", label: "India" },
  { value: "jp", label: "Japan" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
];

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const { activeWorkspace, refreshWorkspaces } = useWorkspace();

  // Profile state
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences
  const [emailOnMention, setEmailOnMention] = useState(true);
  const [emailOnDrop, setEmailOnDrop] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackOnMention, setSlackOnMention] = useState(false);
  const [slackOnDrop, setSlackOnDrop] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Workspace settings state
  const [wsName, setWsName] = useState("");
  const [wsDomain, setWsDomain] = useState("");
  const [wsTimezone, setWsTimezone] = useState("UTC");
  const [wsRegion, setWsRegion] = useState("us");
  const [wsLanguage, setWsLanguage] = useState("en");
  const [wsUpdateFrequency, setWsUpdateFrequency] = useState("daily");
  const [wsKeywordsText, setWsKeywordsText] = useState("");
  const [wsBrandNamesText, setWsBrandNamesText] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setProfileName(session.user.name || "");
    }
  }, [session]);

  useEffect(() => {
    if (activeWorkspace) {
      setWsName(activeWorkspace.name);
      setWsDomain(activeWorkspace.domain || "");
      setWsTimezone(activeWorkspace.timezone || "UTC");
      setWsRegion(activeWorkspace.region || "us");
      setWsLanguage(activeWorkspace.language || "en");
      setWsUpdateFrequency(activeWorkspace.updateFrequency || "daily");
      setWsKeywordsText(activeWorkspace.keywords?.join(", ") || "");
      setWsBrandNamesText((activeWorkspace as any).brandNames?.join(", ") || "");
    }
  }, [activeWorkspace]);

  // Load notification preferences from API
  useEffect(() => {
    if (!activeWorkspace) return;
    setLoadingNotifications(true);
    fetch(`/api/workspaces/${activeWorkspace.id}/notification-preferences`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.preferences) {
          setEmailOnMention(data.preferences.emailOnMention);
          setEmailOnDrop(data.preferences.emailOnDrop);
          setEmailDigest(data.preferences.emailDigest);
          setSlackWebhookUrl(data.preferences.slackWebhookUrl || "");
          setSlackOnMention(data.preferences.slackOnMention);
          setSlackOnDrop(data.preferences.slackOnDrop);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingNotifications(false));
  }, [activeWorkspace]);

  const handleSaveNotifications = async () => {
    if (!activeWorkspace) return;
    setSavingNotifications(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/notification-preferences`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailOnMention,
            emailOnDrop,
            emailDigest,
            slackWebhookUrl,
            slackOnMention,
            slackOnDrop,
          }),
        }
      );
      if (res.ok) {
        toast.success("Notification preferences saved");
      } else {
        toast.error("Failed to save notification preferences");
      }
    } catch {
      toast.error("Failed to save notification preferences");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profileName }),
      });
      if (res.ok) {
        toast.success("Profile updated");
        updateSession({ name: profileName });
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update profile");
      }
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        toast.success("Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to change password");
      }
    } catch {
      toast.error("Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!activeWorkspace) return;
    setSavingWorkspace(true);
    try {
      const keywords = wsKeywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const brandNames = wsBrandNamesText
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);

      const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wsName,
          domain: wsDomain || undefined,
          timezone: wsTimezone,
          region: wsRegion,
          language: wsLanguage,
          updateFrequency: wsUpdateFrequency,
          keywords,
          brandNames,
          onboardingCompleted:
            Boolean(wsDomain) && keywords.length > 0,
        }),
      });
      if (res.ok) {
        toast.success("Workspace settings saved");
        refreshWorkspaces();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save workspace settings");
      }
    } catch {
      toast.error("Failed to save workspace settings");
    } finally {
      setSavingWorkspace(false);
    }
  };

  const isOwnerOrAdmin = ["owner", "admin"].includes(
    activeWorkspace?.role || ""
  );



  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile and workspace settings"
      />

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  value={session?.user?.email || ""}
                  disabled
                  className="opacity-60"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Password Tab */}
        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your account password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleChangePassword}
                disabled={
                  changingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {changingPassword ? "Changing..." : "Change Password"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose what notifications you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold mb-3">Email Notifications</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>New AI Overview Mention</Label>
                      <p className="text-sm text-muted-foreground">
                        Get notified when your site appears in a new AI Overview
                      </p>
                    </div>
                    <Switch
                      checked={emailOnMention}
                      onCheckedChange={setEmailOnMention}
                      disabled={loadingNotifications}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Content Dropped Alert</Label>
                      <p className="text-sm text-muted-foreground">
                        Get notified when your site is removed from an AI Overview
                      </p>
                    </div>
                    <Switch
                      checked={emailOnDrop}
                      onCheckedChange={setEmailOnDrop}
                      disabled={loadingNotifications}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Weekly Digest</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive a weekly summary of your AI visibility metrics
                      </p>
                    </div>
                    <Switch
                      checked={emailDigest}
                      onCheckedChange={setEmailDigest}
                      disabled={loadingNotifications}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-3">Slack Integration</h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="slack-webhook">Slack Webhook URL</Label>
                    <Input
                      id="slack-webhook"
                      placeholder="https://hooks.slack.com/services/..."
                      value={slackWebhookUrl}
                      onChange={(e) => setSlackWebhookUrl(e.target.value)}
                      disabled={loadingNotifications}
                    />
                    <p className="text-xs text-muted-foreground">
                      Create an incoming webhook in your Slack workspace settings
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Slack on Brand Mention</Label>
                      <p className="text-sm text-muted-foreground">
                        Send Slack message when your brand appears
                      </p>
                    </div>
                    <Switch
                      checked={slackOnMention}
                      onCheckedChange={setSlackOnMention}
                      disabled={loadingNotifications || !slackWebhookUrl}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Slack on Brand Drop</Label>
                      <p className="text-sm text-muted-foreground">
                        Send Slack message when your brand is removed
                      </p>
                    </div>
                    <Switch
                      checked={slackOnDrop}
                      onCheckedChange={setSlackOnDrop}
                      disabled={loadingNotifications || !slackWebhookUrl}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleSaveNotifications}
                disabled={savingNotifications || loadingNotifications}
              >
                {savingNotifications ? "Saving..." : "Save Preferences"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Workspace Tab */}
        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Settings</CardTitle>
              <CardDescription>
                Configure your workspace for AI visibility monitoring
                {!isOwnerOrAdmin && (
                  <Badge variant="secondary" className="ml-2">
                    View only
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Workspace Name</Label>
                <Input
                  id="ws-name"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-domain">Domain to Track</Label>
                <Input
                  id="ws-domain"
                  placeholder="example.com"
                  value={wsDomain}
                  onChange={(e) => setWsDomain(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  The domain to check for in AI Overview citations
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-brand-names">Brand Name &amp; Aliases</Label>
                <Input
                  id="ws-brand-names"
                  placeholder="Acme, Acme Corp, ACME Inc"
                  value={wsBrandNamesText}
                  onChange={(e) => setWsBrandNamesText(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of your brand name and any alternative names. Used to detect mentions in AI-generated response text and calculate visibility scores.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-timezone">Timezone</Label>
                <Select
                  value={wsTimezone}
                  onValueChange={setWsTimezone}
                  disabled={!isOwnerOrAdmin}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-keywords">
                  Keywords / Queries to Track
                </Label>
                <Textarea
                  id="ws-keywords"
                  placeholder="Enter keywords separated by commas (e.g., best CRM tools, project management software, ...)"
                  value={wsKeywordsText}
                  onChange={(e) => setWsKeywordsText(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  These keywords will be monitored in Google AI Overviews
                </p>
              </div>

              <Separator />
              <h4 className="text-sm font-semibold">Search Settings</h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Search Region</Label>
                  <Select
                    value={wsRegion}
                    onValueChange={setWsRegion}
                    disabled={!isOwnerOrAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Country for SERP results
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select
                    value={wsLanguage}
                    onValueChange={setWsLanguage}
                    disabled={!isOwnerOrAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Language for AI Overview parsing
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Update Frequency</Label>
                  <Select
                    value={wsUpdateFrequency}
                    onValueChange={setWsUpdateFrequency}
                    disabled={!isOwnerOrAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="twice_daily">Twice Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    How often to auto-check keywords
                  </p>
                </div>
              </div>
            </CardContent>
            {isOwnerOrAdmin && (
              <CardFooter>
                <Button
                  onClick={handleSaveWorkspace}
                  disabled={savingWorkspace}
                >
                  {savingWorkspace ? "Saving..." : "Save Workspace Settings"}
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
