export type DraftComponent = {
  component_id: string;
  component_type: "led" | "temperature" | "humidity" | "analog" | "readonly";
  label: string; device_id: string; pin: string; field_key: string;
  field_type: "number" | "boolean" | "categorical";
  unit: string; precision: number; freshness_seconds: number;
};
export type DraftDevice = { device_id: string; connector: "usb" | "mqtt"; serial_port: string; baud_rate: number };
export type ProjectTemplate = {
  id: string; version: number; name: string; description: string; hardware: boolean;
  board?: string; fqbn?: string; source?: string; visual_profile?: string;
  defaults: { device_id: string; connector: "usb" | "mqtt"; baud_rate: number; interval_seconds: number; freshness_seconds: number };
  components: (Omit<DraftComponent, "device_id" | "freshness_seconds" | "pin"> & { pin: string | null })[];
  notes: string[];
};
export const templateComponents = (spec: ProjectTemplate, device: string, freshness: number): DraftComponent[] =>
  spec.components.map((item) => ({ ...item, pin: item.pin ?? "", device_id: device, freshness_seconds: freshness }));
