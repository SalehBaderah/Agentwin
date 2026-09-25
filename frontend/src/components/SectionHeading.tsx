export function SectionHeading({ title, aside, level = 2 }: { title: React.ReactNode; aside?: React.ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Heading className={level === 2 ? "text-lg font-semibold" : "text-base font-semibold"}>{title}</Heading>
      {aside && <div className="text-sm text-muted-foreground [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-brand [&_a:hover]:underline">{aside}</div>}
    </div>
  );
}
