import type { DetailField } from "@/types/backend";

/**
 * A label/value grid for backend DetailField lists, with sensitive-value
 * masking. Tailwind replacement for the Cloudscape detail-card grid that the
 * M5 workspace views share.
 */
function DetailFieldList({
  fields = [],
  emptyText,
  showSensitiveValues = true,
}: {
  fields?: DetailField[];
  emptyText: string;
  showSensitiveValues?: boolean;
}) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
      {fields.map((field) => (
        <div
          key={`${field.label}-${field.value}`}
          className="rounded-lg border border-border bg-muted/40 px-3 py-2"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {field.label}
          </div>
          <div className="break-words text-sm text-foreground">
            {field.sensitive && !showSensitiveValues ? "Hidden" : field.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export { DetailFieldList };
