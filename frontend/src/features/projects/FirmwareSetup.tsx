import { useEffect, useMemo, useState } from "react";
import { Download, FileCode, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { api, type Project, type State } from "@/types";
import type { ProjectTemplate } from "./projectTemplates";
import { readSetupRecord, setupEvidence, setupRecordKey, writeSetupRecord, type SetupRecord } from "./setupProgress";
import { boardProfiles, profilePreferenceKey, resolveProfile } from "@/features/digital-twin/physical/profiles";
import { OnboardingProgress } from "./OnboardingProgress";

type FirmwareCheck = { compatible: boolean; errors: string[]; warnings: string[]; board: string; fqbn: string; baud_rate: number; version: number; connector: string };

type SetupProps = { project: Project; state: State; connected: boolean };

export function FirmwareSetup({ project, state, connected }: SetupProps) {
  const [catalog, setCatalog] = useState<ProjectTemplate[]>([]);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api<ProjectTemplate[]>("/project-templates").then((items) => { if (active) { setCatalog(items.filter((item) => item.hardware)); setLoadError(""); } }).catch((error: Error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [attempt]);
  if (loadError) return <p role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">{loadError}<Button variant="outline" onClick={() => setAttempt(attempt + 1)}>Retry</Button></p>;
  if (!catalog.length) return <p role="status" className="text-sm text-muted-foreground">Loading hardware templates…</p>;
  return <DeviceFirmwareSetup key={project.id} project={project} state={state} connected={connected} catalog={catalog} />;
}

function DeviceFirmwareSetup({ project, state, connected, catalog }: SetupProps & { catalog: ProjectTemplate[] }) {
  const [deviceId, setDeviceId] = useState(project.device_id);
  const [templateId, setTemplateId] = useState(catalog.find((item) => item.id === project.template)?.id ?? catalog.find((item) => item.defaults.connector === project.connector)?.id ?? catalog[0].id);
  const [result, setResult] = useState<{ key: string; check?: FirmwareCheck; error?: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [recordState, setRecordState] = useState<{ key: string; record: SetupRecord } | null>(null);
  const [recordError, setRecordError] = useState("");
  const [artworkNotice, setArtworkNotice] = useState("");
  const [clock, setClock] = useState(() => Date.now() / 1000);
  const serverOffset = useMemo(() => state.server_time - Date.now() / 1000, [state.server_time]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const device = project.devices.find((item) => item.id === deviceId);
  const spec = catalog.find((item) => item.id === templateId)!;
  const contract = JSON.stringify([spec.version, project.devices, project.graph.fields, project.graph.components, project.graph.capabilities, project.interval_seconds, project.freshness_seconds]);
  const key = `${project.id}:${deviceId}:${templateId}:${contract}`;
  const storageKey = setupRecordKey(project.id, deviceId, templateId);
  const record = recordState?.key === key ? recordState.record : readSetupRecord(localStorage, storageKey, contract);
  const saveRecord = (next: SetupRecord) => {
    setRecordState({ key, record: next });
    try { writeSetupRecord(localStorage, storageKey, contract, next); setRecordError(""); }
    catch { setRecordError("Setup actions are recorded for this visit only; browser storage is unavailable."); }
  };
  const endpoint = `/projects/${encodeURIComponent(project.id)}/devices/${encodeURIComponent(deviceId)}`;
  const query = `?template_id=${encodeURIComponent(templateId)}`;
  useEffect(() => {
    let active = true;
    api<FirmwareCheck>(endpoint + "/firmware-check" + query).then((check) => { if (active) setResult({ key, check }); }).catch((error: Error) => { if (active) setResult({ key, error: error.message }); });
    return () => { active = false; };
  }, [endpoint, query, key, attempt]);
  const check = result?.key === key ? result.check : undefined;
  const error = result?.key === key ? result.error : undefined;
  const evidence = setupEvidence(state, project, deviceId, spec.components.map((item) => item.field_key), !!check?.compatible, connected, Math.max(state.server_time, clock + serverOffset));
  const profile = resolveProfile(undefined, spec.visual_profile);
  const applyArtwork = () => {
    try {
      localStorage.setItem(profilePreferenceKey(project.id, deviceId), JSON.stringify(spec.visual_profile || "generic"));
      setArtworkNotice(`Artwork set to ${profile.profile.label} in this browser. This does not identify the physical board.`);
    } catch { setArtworkNotice("Could not save artwork: browser storage is unavailable."); }
  };
  const download = async () => {
    setDownloading(true); setDownloadError("");
    try {
      const response = await fetch("/api" + endpoint + "/firmware.zip" + query);
      if (!response.ok) { const body = await response.json(); throw new Error(body.detail || "Package generation failed."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `${project.id}-${deviceId}-firmware.zip`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      saveRecord({ downloadedAt: Date.now() / 1000 });
    } catch (failure) { setDownloadError((failure as Error).message); }
    finally { setDownloading(false); }
  };
  return <section aria-label="Device firmware setup" className="grid gap-5">
    <div><h2 className="text-lg font-semibold">Device setup</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Choose supported hardware, configure the device, deploy its Agentwin firmware package, and bring it into the same operational workspace.</p><p className="mt-2 text-xs text-muted-foreground">Hardware Templates create one device per project. Custom configurations support multiple-device assemblies.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="firmware-device" label="Device"><OptionSelect id="firmware-device" className="bg-background text-foreground dark:bg-background dark:hover:bg-muted" value={deviceId} onValueChange={(value) => { setDeviceId(value); setDownloadError(""); }} options={project.devices.map((item) => ({ value: item.id, label: item.id }))} /></FormField>
      <FormField id="firmware-template" label="Hardware Template"><OptionSelect id="firmware-template" className="bg-background text-foreground dark:bg-background dark:hover:bg-muted" value={templateId} onValueChange={(value) => { setTemplateId(value); setDownloadError(""); setArtworkNotice(""); }} options={catalog.map((item) => ({ value: item.id, label: item.name }))} /></FormField>
    </div>
    <OnboardingProgress key={`${key}:${state.session.id}`} configured={!!device} record={record} evidence={evidence} canConfirmUpload={!!check?.compatible} recordError={recordError} onToggleUpload={() => saveRecord({ downloadedAt: record.downloadedAt, ...(!record.flashedAt ? { flashedAt: Date.now() / 1000 } : {}) })} />
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><FileCode className="mt-0.5 size-5 shrink-0 text-brand" /><div><h3 className="font-semibold">{spec.name}</h3><p className="mt-1 text-sm text-muted-foreground">{spec.board} · Version {spec.version}</p></div></div><span className="rounded-md border bg-background px-2.5 py-1 text-xs">{device?.connector.toUpperCase()}</span></div>
      {!check && !error && <p role="status" className="text-sm text-muted-foreground">Checking saved configuration…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error} <Button variant="ghost" size="sm" onClick={() => setAttempt(attempt + 1)}><RefreshCw />Retry</Button></p>}
      {check && <>
        <p role="status" className={`text-sm font-medium ${check.compatible ? "text-foreground" : "text-destructive"}`}>{check.compatible ? "Saved configuration matches this firmware." : "Resolve these configuration differences before downloading:"}</p>
        {!!check.errors.length && <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">{check.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
        <div className="border-t pt-4"><p className="mb-2 text-sm font-medium">The package includes</p><p className="text-sm leading-relaxed text-muted-foreground">Firmware and shared libraries, generated project/device IDs, a build script, an upload script, MQTT permission rules, and setup instructions.{check.connector === "usb" ? ` The USB gateway script uses ${check.baud_rate} baud.` : " Wi-Fi and broker credentials are filled locally after download."}</p></div>
        <div className="grid gap-2 border-t pt-4"><p className="text-sm font-medium">Digital Twin artwork · configured metadata</p><p className="text-xs leading-relaxed text-muted-foreground">{profile.unknown ? "Unknown profile—generic artwork" : profile.profile.label} · {spec.fqbn}. The Hardware Template supplies board artwork, components, pins and transport; this is configuration, not hardware detection or verified wiring. Browser artwork overrides remain available in Physical 2D.</p><div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" disabled={!check.compatible || !Object.hasOwn(boardProfiles, spec.visual_profile || "generic")} onClick={applyArtwork}>Use suggested artwork in this browser</Button><Link reloadDocument className="text-xs font-medium text-brand underline underline-offset-4" to={`/projects/${project.id}?tab=twin`}>Open Digital Twin</Link></div>{artworkNotice && <p role="status" className="text-xs text-muted-foreground">{artworkNotice}</p>}</div>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">{check.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4"><Button disabled={!check.compatible || downloading} onClick={download}><Download />{downloading ? "Preparing package…" : "Download firmware package"}</Button><p className="text-xs text-muted-foreground">Compile and upload locally, then verify Live readings.</p></div>
      </>}
      {downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
    </Card>
    <p className="text-xs leading-relaxed text-muted-foreground">Selecting a template checks compatibility; it does not identify the physical board. Hardware wiring, calibration, and physical output still need verification.</p>
  </section>;
}
