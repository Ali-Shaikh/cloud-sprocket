// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  SERVICE_DOMAIN_FALLBACK_GROUP,
  SERVICE_DOMAIN_LABELS,
  SERVICE_DOMAIN_ORDER,
  groupByServiceDomain,
} from "./service-domains";

interface Entry {
  id: string;
  domain?: string;
}

const domainOf = (entry: Entry) => entry.domain;

describe("groupByServiceDomain", () => {
  it("orders groups by the fixed domain order, not input order", () => {
    const groups = groupByServiceDomain<Entry>(
      [
        { id: "iam", domain: "security" },
        { id: "s3", domain: "storage" },
        { id: "ec2", domain: "compute" },
      ],
      domainOf,
    );
    expect(groups.map((group) => group.label)).toEqual(["Compute", "Storage", "Security & identity"]);
  });

  it("preserves item order within a group", () => {
    const groups = groupByServiceDomain<Entry>(
      [
        { id: "ec2", domain: "compute" },
        { id: "lambda", domain: "compute" },
        { id: "ecs", domain: "compute" },
      ],
      domainOf,
    );
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["ec2", "lambda", "ecs"]);
  });

  it("omits empty groups", () => {
    const groups = groupByServiceDomain<Entry>([{ id: "s3", domain: "storage" }], domainOf);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("domain:storage");
  });

  it("sends entries without a domain to a trailing Services group (older daemon snapshots)", () => {
    const groups = groupByServiceDomain<Entry>(
      [
        { id: "s3", domain: "storage" },
        { id: "legacy-tab" },
      ],
      domainOf,
    );
    expect(groups.map((group) => group.label)).toEqual(["Storage", "Services"]);
    expect(groups[1]?.id).toBe(SERVICE_DOMAIN_FALLBACK_GROUP.id);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["legacy-tab"]);
  });

  it("treats unknown domain values like missing ones", () => {
    const groups = groupByServiceDomain<Entry>([{ id: "x", domain: "quantum" }], domainOf);
    expect(groups.map((group) => group.label)).toEqual(["Services"]);
  });

  it("returns only the fallback group when no entry has a domain, matching the pre-domain sidebar", () => {
    const groups = groupByServiceDomain<Entry>(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      domainOf,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Services");
    expect(groups[0]?.items).toHaveLength(3);
  });

  it("has a label for every domain in the order list", () => {
    for (const domain of SERVICE_DOMAIN_ORDER) {
      expect(SERVICE_DOMAIN_LABELS[domain]).toBeTruthy();
    }
  });
});
