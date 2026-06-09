import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

function LogStream({
  lines,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  lines: string[];
}) {
  return (
    <div
      data-slot="log-stream"
      className={cn(
        "overflow-hidden rounded-lg border border-border-strong bg-rail",
        className,
      )}
      {...props}
    >
      <ScrollArea className="h-64">
        <div className="p-4 font-mono text-xs leading-relaxed text-[color:oklch(0.85_0.02_256)]">
          {lines.length === 0 ? (
            <p className="text-[color:oklch(0.6_0.02_256)]">Waiting for output…</p>
          ) : (
            lines.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap break-all">
                <span className="mr-3 select-none text-[color:oklch(0.5_0.02_256)]">
                  {String(index + 1).padStart(3, " ")}
                </span>
                {line}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export { LogStream };
