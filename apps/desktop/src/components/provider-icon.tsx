// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Cloud } from "lucide-react";

import { cn } from "@/lib/utils";
import awsUrl from "@/assets/cloud-icons/aws.svg";
import awsRailUrl from "@/assets/cloud-icons/aws-rail.svg";
import azureUrl from "@/assets/cloud-icons/azure.svg";
import gcpUrl from "@/assets/cloud-icons/gcp.svg";

const PROVIDER_LOGOS: Record<string, string> = {
  aws: awsUrl,
  azure: azureUrl,
  gcp: gcpUrl,
};

/** Rail uses the white AWS wordmark on a transparent background. */
const PROVIDER_RAIL_LOGOS: Record<string, string> = {
  aws: awsRailUrl,
  azure: azureUrl,
  gcp: gcpUrl,
};

const PROVIDER_LABELS: Record<string, string> = {
  aws: "AWS",
  azure: "Microsoft Azure",
  gcp: "Google Cloud",
};

const PROVIDER_ACCENTS: Record<string, string> = {
  aws: "#ff9900",
  azure: "#0078d4",
  gcp: "#4285f4",
};

type ProviderIconVariant = "default" | "nav" | "rail" | "card";

function ProviderIcon({
  provider,
  size = 20,
  variant = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "width" | "height"> & {
  provider: "aws" | "azure" | "gcp" | string;
  /** Pixel size of the square icon. */
  size?: number;
  /** Visual treatment for rail plates, nav headers, or connect cards. */
  variant?: ProviderIconVariant;
}) {
  const key = provider.toLowerCase();
  const logo = PROVIDER_LOGOS[key];
  const railLogo = PROVIDER_RAIL_LOGOS[key] ?? logo;
  const glyphSize = Math.round(size * 0.625);

  if (variant === "rail") {
    return (
      <span
        data-slot="provider-icon"
        data-provider={key}
        data-variant="rail"
        className={cn(
          "grid place-items-center rounded-[9px] bg-white/[0.08]",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {railLogo ? (
          <img
            src={railLogo}
            width={glyphSize}
            height={glyphSize}
            alt=""
            className="inline-block object-contain"
          />
        ) : (
          <Cloud className="size-5 text-sky-300" aria-hidden />
        )}
      </span>
    );
  }

  if (!logo) {
    return (
      <Cloud
        data-slot="provider-icon"
        data-provider={key}
        data-variant={variant}
        className={cn("text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-label={`${provider} provider`}
      />
    );
  }

  if (variant === "nav") {
    return (
      <span
        data-slot="provider-icon"
        data-provider={key}
        data-variant="nav"
        className={cn("grid place-items-center rounded-[9px] bg-muted", className)}
        style={{ width: size, height: size }}
      >
        <img
          src={logo}
          width={glyphSize}
          height={glyphSize}
          alt=""
          className="inline-block object-contain"
        />
      </span>
    );
  }

  return (
    <img
      data-slot="provider-icon"
      data-provider={key}
      data-variant={variant}
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

export { ProviderIcon, PROVIDER_ACCENTS };