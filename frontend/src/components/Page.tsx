import { cn } from "@/lib/utils";

export function Page({ className, children }: { className?: string; children: React.ReactNode }) {
  return <main data-slot="page" className={cn("page mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-4 px-4 py-6 min-[541px]:px-5 min-[900px]:px-6 min-[1180px]:p-8", className)}>{children}</main>;
}
