export function SectionHeading({ title, aside, level = 2 }: { title: React.ReactNode; aside?: React.ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="mt-3 flex flex-col items-start gap-1">
      <Heading className={level === 2 ? "text-[17px] font-bold tracking-[-0.3px]" : "mb-2 text-base font-semibold"}>{title}</Heading>
      {aside && <div className="text-[13px] text-subtle-foreground [&_a]:inline-flex [&_a]:items-center [&_a]:gap-2 [&_a:hover]:text-foreground">{aside}</div>}
    </div>
  );
}
