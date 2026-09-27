export function PageHeader({ actions, eyebrow, title, description, meta }: { actions?: React.ReactNode; eyebrow: string; title: string; description: string; meta?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{eyebrow}</p>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p> : null}
        {meta}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
