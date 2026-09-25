import { useState } from "react";
import { Copy } from "lucide-react";

export function CompactId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  return <span className="compact-id" title={value}><code>{value.slice(0, 8)}…</code><button type="button" onClick={copy} aria-label={`Copy ${value}`} title="Copy full ID"><Copy size={12}/></button>{copied&&<small>Copied</small>}</span>;
}

export function ProjectId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  return <div className="project-id-line"><span>Project ID</span><code>{value}</code><button type="button" onClick={copy} aria-label="Copy project ID" title="Copy project ID"><Copy size={13}/>{copied ? "Copied" : "Copy"}</button></div>;
}
