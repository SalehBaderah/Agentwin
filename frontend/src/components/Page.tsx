import { cn } from "@/lib/utils";

export function Page({ className, children }: { className?: string; children: React.ReactNode }) {
  return <main className={cn("page mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-6 px-4 py-6 md:px-8", className)}>{children}</main>;
}
