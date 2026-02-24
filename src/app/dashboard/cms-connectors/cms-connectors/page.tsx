"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plug,
  Unplug,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Upload,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface CmsConnection {
  platform: "wordpress" | "webflow" | "shopify";
  status: "connected" | "disconnected" | "error";
  siteUrl?: string;
  apiKey?: string;
  lastSync?: string;
  capabilities: string[];
}

const platformInfo = {
  wordpress: {
    name: "WordPress",
    icon: "🔵",
    description: "Connect via REST API with Application Passwords for schema injection.",
    authHint: "Format: username:application_password (enable Application Passwords in WordPress → Users → Edit → Application Passwords)",
    urlHint: "https://your-site.com",
  },
  webflow: {
    name: "Webflow",
    icon: "🟣",
    description: "Inject schema markup into page custom code via Webflow API v2.",
    authHint: "Webflow API token with sites:read and custom_code:write scopes",
    urlHint: "https://your-site.webflow.io or Webflow site ID",
  },
  shopify: {
    name: "Shopify",
    icon: "🟢",
    description: "Add product schema via Shopify Admin API theme assets.",
    authHint: "Custom App access token with read_themes and write_themes scopes",
    urlHint: "https://your-store.myshopify.com",
  },
};

export default function CmsConnectorsPage() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<CmsConnection[]>([]);
  const [connectForm, setConnectForm] = useState<{
    platform: string;
    siteUrl: string;
    apiKey: string;
  } | null>(null);
  const [pushForm, setPushForm] = useState<{
    platform: string;
    schemaData: string;
  } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [pushing, setPushing] = useState<string | null>(null);

  const fetchConnections = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/cms-connectors`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConnections(data.connections);
    } catch {
      toast.error("Failed to load CMS connections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  const handleConnect = async (platform: string) => {
    if (!activeWorkspace || !connectForm) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/cms-connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          platform,
          siteUrl: connectForm.siteUrl,
          apiKey: connectForm.apiKey,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${platform} connected successfully`);
      setConnectForm(null);
      fetchConnections();
    } catch {
      toast.error("Failed to connect");
    }
  };

  const handleDisconnect = async (platform: string) => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/cms-connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", platform }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${platform} disconnected`);
      fetchConnections();
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleTest = async (platform: string) => {
    if (!activeWorkspace) return;
    setTesting(platform);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/cms-connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", platform }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${data.message} (${data.latency})`);
      } else {
        toast.error(data.message || "Connection test failed");
      }
      fetchConnections();
    } catch {
      toast.error("Connection test failed");
    } finally {
      setTesting(null);
    }
  };

  const handlePushSchema = async (platform: string) => {
    if (!activeWorkspace || !pushForm) return;
    setPushing(platform);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/cms-connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push-schema",
          platform,
          schemaData: pushForm.schemaData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setPushForm(null);
        fetchConnections();
      } else {
        toast.error(data.message || "Schema push failed");
      }
    } catch {
      toast.error("Schema push failed");
    } finally {
      setPushing(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="CMS Plugin Connectors"
        description="Connect WordPress, Webflow, or Shopify to push schema markup and content updates directly."
        helpText="Link your CMS platform to automatically push structured data, schema markup, and optimization updates from Citatra to your website."
      />

      {/* Setup guide */}
      <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-1">Real CMS Integration</p>
          <p>
            These connectors use live API calls to your CMS. Schema pushes will modify your site
            in real-time via the platform&apos;s REST API. Test your connection first before pushing.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {connections.map((conn) => {
            const info = platformInfo[conn.platform];
            const isConnected = conn.status === "connected";
            const isError = conn.status === "error";
            const showConnectForm = connectForm?.platform === conn.platform;
            const showPushForm = pushForm?.platform === conn.platform;

            return (
              <Card key={conn.platform} className={isError ? "border-red-300" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{info.icon}</span>
                      <CardTitle>{info.name}</CardTitle>
                    </div>
                    {isConnected ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    ) : isError ? (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Error
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <XCircle className="h-3 w-3 mr-1" />
                        Disconnected
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{info.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Capabilities */}
                  <div>
                    <p className="text-xs font-medium mb-2 text-muted-foreground">Capabilities:</p>
                    <ul className="text-xs space-y-1">
                      {conn.capabilities.map((cap, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-green-500 mt-0.5">•</span>
                          {cap}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {(isConnected || isError) && (
                    <div className="text-xs text-muted-foreground">
                      <p>Site: {conn.siteUrl}</p>
                      {conn.lastSync && (
                        <p>Last sync: {new Date(conn.lastSync).toLocaleString()}</p>
                      )}
                    </div>
                  )}

                  {/* Connected actions */}
                  {(isConnected || isError) && !showPushForm && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(conn.platform)}
                        disabled={testing === conn.platform}
                      >
                        {testing === conn.platform ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        Test
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          setPushForm({ platform: conn.platform, schemaData: "" })
                        }
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Push Schema
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDisconnect(conn.platform)}
                      >
                        <Unplug className="h-3 w-3 mr-1" />
                        Disconnect
                      </Button>
                    </div>
                  )}

                  {/* Push Schema form */}
                  {showPushForm && (
                    <div className="space-y-3">
                      <label className="text-xs font-medium text-muted-foreground">
                        Paste your JSON-LD schema markup:
                      </label>
                      <textarea
                        className="w-full rounded-md border p-2 text-xs font-mono min-h-[120px] bg-background"
                        placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Your Company"\n}'}
                        value={pushForm?.schemaData || ""}
                        onChange={(e) =>
                          setPushForm((prev) =>
                            prev ? { ...prev, schemaData: e.target.value } : null
                          )
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handlePushSchema(conn.platform)}
                          disabled={!pushForm?.schemaData || pushing === conn.platform}
                        >
                          {pushing === conn.platform ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Upload className="h-3 w-3 mr-1" />
                          )}
                          Push to {info.name}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPushForm(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Connect form (for disconnected) */}
                  {!isConnected && !isError && showConnectForm && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">{info.urlHint}</label>
                        <Input
                          placeholder="Site URL"
                          value={connectForm?.siteUrl || ""}
                          onChange={(e) =>
                            setConnectForm((prev) =>
                              prev ? { ...prev, siteUrl: e.target.value } : null
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{info.authHint}</label>
                        <Input
                          placeholder="API Key / Token"
                          type="password"
                          value={connectForm?.apiKey || ""}
                          onChange={(e) =>
                            setConnectForm((prev) =>
                              prev ? { ...prev, apiKey: e.target.value } : null
                            )
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleConnect(conn.platform)}
                        >
                          Connect
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConnectForm(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Connect button (for disconnected, no form) */}
                  {!isConnected && !isError && !showConnectForm && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setConnectForm({
                          platform: conn.platform,
                          siteUrl: "",
                          apiKey: "",
                        })
                      }
                    >
                      <Plug className="h-3 w-3 mr-1" />
                      Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
