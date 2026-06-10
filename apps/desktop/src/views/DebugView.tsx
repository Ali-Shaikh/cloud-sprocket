import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDebugLogs, subscribeToDebugLogs, type DebugLogEntry } from "@/lib/backend";

function typeVariant(type: DebugLogEntry["type"]): "destructive" | "default" | "success" | "secondary" {
  if (type === "error") {
    return "destructive";
  }
  if (type === "request") {
    return "default";
  }
  if (type === "response") {
    return "success";
  }
  return "secondary";
}

/**
 * M7 Debug Console: Tailwind replacement for the Cloudscape debug table.
 * Streams the in-memory RPC/event/console capture from lib/backend.
 */
export default function DebugView() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);

  useEffect(() => {
    setLogs(getDebugLogs());
    return subscribeToDebugLogs((entry) => {
      setLogs((current) => [entry, ...current].slice(0, 1000));
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Debug Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time RPC and application diagnostics.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No debug activity captured yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Time</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-52">Method/Event</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((entry, index) => (
                <TableRow key={`${entry.timestamp}-${index}`}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeVariant(entry.type)}>{entry.type.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.method || "-"}</TableCell>
                  <TableCell>
                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
