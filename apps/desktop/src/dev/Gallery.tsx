import {
  Cloud,
  Copy,
  Database,
  HardDrive,
  Inbox,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Trash2,
} from "lucide-react";

import { useTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { StatusDot } from "@/components/status-dot";
import { StatusPill } from "@/components/status-pill";
import { ProviderIcon } from "@/components/provider-icon";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/section-header";
import { CodeBlock } from "@/components/code-block";
import { LogStream } from "@/components/log-stream";

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

const BUCKETS = [
  { name: "cs-artifacts-eu", region: "eu-west-1", status: "on" as const, objects: 1842 },
  { name: "cs-backups", region: "us-east-1", status: "warning" as const, objects: 96 },
  { name: "cs-staging", region: "eu-west-2", status: "error" as const, objects: 0 },
];

const LOG_LINES = [
  "[09:41:02] INFO  starting local runtime profile 'azure-emulator'",
  "[09:41:02] INFO  binding storage emulator on 127.0.0.1:10000",
  "[09:41:03] INFO  queue emulator ready on 127.0.0.1:10001",
  "[09:41:03] WARN  no seed data found, creating empty containers",
  "[09:41:04] INFO  table emulator ready on 127.0.0.1:10002",
  "[09:41:05] INFO  runtime healthy — 3 services online",
];

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader title={title} description={description} action={action} />
      {children}
    </section>
  );
}

export default function Gallery() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <TooltipProvider>
      <div className="app-next min-h-screen bg-background p-10 text-foreground">
        <div className="mx-auto max-w-5xl space-y-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Design system gallery</h1>
              <p className="text-sm text-muted-foreground">
                M1 primitive kit — resolved theme: {resolvedTheme}
              </p>
            </div>
            <div className="flex gap-2">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  className={cn(
                    "rounded-md border border-border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    theme === option
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "bg-card hover:bg-accent",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </header>

          <Section title="Buttons" description="Variants and sizes.">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Settings">
                <Settings />
              </Button>
              <Button disabled>Disabled</Button>
              <Button>
                <Plus /> New bucket
              </Button>
            </div>
          </Section>

          <Section title="Badges" description="Status and label tokens.">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
            </div>
          </Section>

          <Section title="Status atoms" description="Dots and pills across all states.">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <StatusDot status="on" ring />
                <StatusDot status="off" />
                <StatusDot status="error" />
                <StatusDot status="warning" pulse />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill status="on" label="Running" />
                <StatusPill status="off" label="Stopped" />
                <StatusPill status="error" label="Failed" />
                <StatusPill status="warning" label="Degraded" pulse />
              </div>
            </div>
          </Section>

          <Section title="Provider icons" description="Cloud logos with a fallback.">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <ProviderIcon provider="aws" size={28} />
                <span className="text-sm">AWS</span>
              </div>
              <div className="flex items-center gap-2">
                <ProviderIcon provider="azure" size={28} />
                <span className="text-sm">Azure</span>
              </div>
              <div className="flex items-center gap-2">
                <ProviderIcon provider="gcp" size={28} />
                <span className="text-sm">GCP</span>
              </div>
              <div className="flex items-center gap-2">
                <ProviderIcon provider="oracle" size={28} />
                <span className="text-sm">Unknown (fallback)</span>
              </div>
            </div>
          </Section>

          <Section title="Stat cards" description="Headline metrics.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Buckets"
                value="12"
                icon={<Database className="size-4" />}
                footer="+2 this week"
              />
              <StatCard
                label="Instances"
                value="34"
                icon={<Server className="size-4" />}
                footer="3 stopped"
              />
              <StatCard
                label="Storage"
                value="1.8 TB"
                icon={<HardDrive className="size-4" />}
                footer="62% of quota"
              />
            </div>
          </Section>

          <Section title="Cards" description="Composable surface.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Local runtime</CardTitle>
                  <CardDescription>
                    Emulate Azure storage and queues on this machine.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StatusPill status="on" label="3 services online" />
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button variant="outline" size="sm">
                    Logs
                  </Button>
                  <Button size="sm">
                    <RefreshCw /> Restart
                  </Button>
                </CardFooter>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Inputs</CardTitle>
                  <CardDescription>Form primitives.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="Bucket name" />
                  <Textarea placeholder="Description (optional)" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Public access</span>
                    <Switch aria-label="Public access" />
                  </div>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu-west-1">eu-west-1</SelectItem>
                      <SelectItem value="us-east-1">us-east-1</SelectItem>
                      <SelectItem value="ap-southeast-2">ap-southeast-2</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>
          </Section>

          <Section
            title="Table"
            description="Buckets with status pills."
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <RefreshCw /> Refresh
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy /> Copy ARN
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Objects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BUCKETS.map((bucket) => (
                    <TableRow key={bucket.name}>
                      <TableCell className="font-medium">{bucket.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {bucket.region}
                      </TableCell>
                      <TableCell>
                        <StatusPill
                          status={bucket.status}
                          label={
                            bucket.status === "on"
                              ? "Active"
                              : bucket.status === "warning"
                                ? "Syncing"
                                : "Error"
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bucket.objects.toLocaleString("en-GB")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Section>

          <Section title="Overlays" description="Dialog, alert dialog, sheet, tooltip.">
            <div className="flex flex-wrap items-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create bucket</DialogTitle>
                    <DialogDescription>
                      Give your new bucket a globally unique name.
                    </DialogDescription>
                  </DialogHeader>
                  <Input placeholder="my-bucket-name" />
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button>Create</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete bucket</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this bucket?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. All objects will be permanently
                      removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Open sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Bucket details</SheetTitle>
                    <SheetDescription>
                      Inspect properties for the selected bucket.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Region</span>
                      <span>eu-west-1</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Objects</span>
                      <span className="tabular-nums">1,842</span>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Help">
                    <Cloud />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Connected to AWS</TooltipContent>
              </Tooltip>
            </div>
          </Section>

          <Section title="Tabs" description="Segmented content.">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <Card>
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    General information about the selected resource.
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="permissions">
                <Card>
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    Access policies and identity bindings.
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="logs">
                <Card>
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    Recent activity for this resource.
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </Section>

          <Section title="Code and logs" description="Monospace surfaces.">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <CodeBlock>{`$ floci-az emulator start --profile azure
> storage emulator ready on :10000
> queue emulator ready on :10001`}</CodeBlock>
              <LogStream lines={LOG_LINES} />
            </div>
          </Section>

          <Section title="Avatar, separator, skeleton, empty state">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src="" alt="" />
                  <AvatarFallback>AS</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">Ali Shaikh</p>
                  <p className="text-xs text-muted-foreground">ali.az.shaikh@gmail.com</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="space-y-2 pt-6">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>

                <EmptyState
                  icon={<Inbox />}
                  title="No buckets yet"
                  description="Create your first bucket to start storing objects in the cloud."
                  action={
                    <Button size="sm">
                      <Plus /> New bucket
                    </Button>
                  }
                />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </TooltipProvider>
  );
}
