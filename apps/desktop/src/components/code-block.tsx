import { cn } from "@/lib/utils";

function CodeBlock({
  children,
  className,
  ...props
}: React.ComponentProps<"pre">) {
  return (
    <pre
      data-slot="code-block"
      className={cn(
        "overflow-x-auto rounded-lg border border-border-strong bg-rail p-4 font-mono text-xs leading-relaxed text-[color:oklch(0.92_0.01_256)]",
        className,
      )}
      {...props}
    >
      <code>{children}</code>
    </pre>
  );
}

export { CodeBlock };
