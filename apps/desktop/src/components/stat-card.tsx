import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

function StatCard({
  label,
  value,
  icon,
  footer,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  /** Optional footer / trend slot beneath the value. */
  footer?: React.ReactNode;
}) {
  return (
    <Card data-slot="stat-card" className={cn("gap-0 py-5", className)} {...props}>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {footer ? (
          <span className="text-xs text-muted-foreground">{footer}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export { StatCard };
