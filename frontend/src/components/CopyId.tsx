import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return { copied, copy };
}

export function CompactId({ value }: { value: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={value}>
      <code className="font-mono">{value.slice(0, 8)}…</code>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={copy} aria-label={`Copy ${value}`}>
            <Copy className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy full ID</TooltipContent>
      </Tooltip>
      {copied && <small>Copied</small>}
    </span>
  );
}

export function ProjectId({ value }: { value: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
      <span>Project ID</span>
      <code className="rounded-md border bg-accent px-2 py-[5px] font-mono text-foreground wrap-anywhere">{value}</code>
      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 rounded-md bg-transparent px-2 text-[13px] font-normal text-muted-foreground" onClick={copy} aria-label="Copy project ID">
        <Copy className="size-3.5" />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
