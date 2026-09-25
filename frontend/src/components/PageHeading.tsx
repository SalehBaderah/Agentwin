export function PageHeading({ eyebrow, title, description, actions, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-[18px] min-[541px]:gap-6">
      <div className="min-w-0 flex-[1_1_320px]">
        {eyebrow && <div className="mb-2 text-xs font-semibold text-muted-foreground">{eyebrow}</div>}
        <h1 className="mb-2 font-heading text-[28px] leading-[1.15] font-[650] tracking-[-1.2px] text-foreground min-[721px]:text-[clamp(30px,3vw,40px)]">{title}</h1>
        {description && <p className="text-sm leading-[1.65] text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex gap-2 max-[540px]:w-full max-[540px]:*:flex-1">{actions}</div>}
    </div>
  );
}
