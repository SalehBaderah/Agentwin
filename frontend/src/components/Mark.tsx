import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg className={cn("size-8 shrink-0", className)} viewBox="0 0 48 40" fill="none" aria-hidden="true">
      <path className="fill-current" d="M2.5 36 17.6 4.3A2 2 0 0 1 19.4 3H24l-4.2 9L8.9 36H2.5Z" />
      <path className="fill-[#7c3aed]" d="M24.1 3h4.5a2 2 0 0 1 1.8 1.2L45.5 36h-6.4L20.2 12l3.9-9Z" />
      <path className="fill-current" d="M9.8 24h10.7v3H8.4l1.4-3Z" />
      <path className="fill-[#7c3aed]" d="M27.5 24h10.7l1.4 3H27.5v-3Z" />
      <path className="fill-current" d="m17.5 25.5 5-5v10l-5-5Z" />
      <path className="fill-[#7c3aed]" d="m23.5 20.5 5 5-5 5v-10Z" />
    </svg>
  );
}
