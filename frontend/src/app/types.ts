
export type ServiceHealth = {
  mqtt: boolean;
  agent_configured: boolean;
  agent_available: boolean;
  email_configured: boolean;
  email_default_recipient_configured: boolean;
  mqtt_rejections: number;
};

export type ProjectContext = { projectId: string; mode: string };

export type CommandItem = {
  id: string;
  label: string;
  meta: string;
  path: string;
  kind: "project" | "device" | "event" | "settings";
};
