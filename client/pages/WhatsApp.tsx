import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STORAGE_KEY = "whatsappConfig";

type WhatsAppConfig = {
  endpoint: string;
  appkey: string;
  authkey: string;
  templateId?: string;
  imageHost?: string; // e.g. https://your-domain.com
};

function loadConfig(): WhatsAppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {
        endpoint: "https://whatsapp.atdsonata.fun/api/create-message",
        appkey: "a0631fb3-0a75-46e0-848d-9f8a58a0caf4",
        authkey: "da794E7rsuSN7lboIdPIR1lMftFTCnFK1LKGt7isiuhEcwxMel",
        templateId: "",
        imageHost: "https://atdsonata.fun/",
      };
    const parsed = JSON.parse(raw);
    return {
      endpoint:
        parsed.endpoint || "https://whatsapp.atdsonata.fun/api/create-message",
      appkey: parsed.appkey || "",
      authkey: parsed.authkey || "",
      templateId: parsed.templateId || "",
      imageHost: parsed.imageHost || "",
    };
  } catch {
    return {
      endpoint: "https://whatsapp.atdsonata.fun/api/create-message",
      appkey: "",
      authkey: "",
      templateId: "",
      imageHost: "",
    };
  }
}

function saveConfig(cfg: WhatsAppConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export default function WhatsAppSettings() {
  const [config, setConfig] = useState<WhatsAppConfig>(() => loadConfig());

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        saveConfig(config);
      } catch {}
    }, 400);
    return () => clearTimeout(id);
  }, [config]);

  function handleSave() {
    if (!config.appkey || !config.authkey) {
      toast.error("Enter both appkey and authkey");
      return;
    }
    saveConfig(config);
    toast.success("WhatsApp settings saved");
  }

  return (
    <div className="container mx-auto py-10 space-y-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">
          WhatsApp Settings
        </h1>
        <p className="text-muted-foreground">
          Store API details for sending reports on WhatsApp.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>API Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Endpoint</label>
            <Input
              value={config.endpoint}
              onChange={(e) =>
                setConfig((c) => ({ ...c, endpoint: e.target.value }))
              }
              placeholder="https://whatsapp.atdsonata.fun/api/create-message"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">App Key</label>
            <Input
              type="password"
              autoComplete="off"
              value={config.appkey}
              onChange={(e) =>
                setConfig((c) => ({ ...c, appkey: e.target.value }))
              }
              placeholder="your appkey"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Auth Key</label>
            <Input
              type="password"
              autoComplete="off"
              value={config.authkey}
              onChange={(e) =>
                setConfig((c) => ({ ...c, authkey: e.target.value }))
              }
              placeholder="your authkey"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">
              Image Host URL
            </label>
            <Input
              value={config.imageHost || ""}
              onChange={(e) =>
                setConfig((c) => ({ ...c, imageHost: e.target.value }))
              }
              placeholder="https://your-domain.com"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. If set, generated image URLs will use this host instead
              of the app origin.
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">
              Template ID (optional)
            </label>
            <Input
              value={config.templateId || ""}
              onChange={(e) =>
                setConfig((c) => ({ ...c, templateId: e.target.value }))
              }
              placeholder="e.g. 1234 (if your provider requires it)"
            />
          </div>
          <div className="pt-2">
            <Button onClick={handleSave}>Save</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
