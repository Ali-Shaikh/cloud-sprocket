import { Cloud } from "lucide-react";

import { cn } from "@/lib/utils";
import awsUrl from "@/assets/cloud-icons/aws.svg";
import azureUrl from "@/assets/cloud-icons/azure.svg";
import gcpUrl from "@/assets/cloud-icons/gcp.svg";

const PROVIDER_LOGOS: Record<string, string> = {
  aws: awsUrl,
  azure: azureUrl,
  gcp: gcpUrl,
};

const PROVIDER_LABELS: Record<string, string> = {
  aws: "AWS",
  azure: "Microsoft Azure",
  gcp: "Google Cloud",
};

function ProviderIcon({
  provider,
  size = 20,
  className,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "width" | "height"> & {
  provider: "aws" | "azure" | "gcp" | string;
  /** Pixel size of the square icon. */
  size?: number;
}) {
  const key = provider.toLowerCase();
  const logo = PROVIDER_LOGOS[key];

  if (!logo) {
    return (
      <Cloud
        data-slot="provider-icon"
        data-provider={key}
        className={cn("text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-label={`${provider} provider`}
      />
    );
  }

  return (
    <img
      data-slot="provider-icon"
      data-provider={key}
      src={logo}
      width={size}
      height={size}
      alt={`${PROVIDER_LABELS[key] ?? provider} logo`}
      className={cn("inline-block object-contain", className)}
      style={{ width: size, height: size }}
      {...props}
    />
  );
}

export { ProviderIcon };
