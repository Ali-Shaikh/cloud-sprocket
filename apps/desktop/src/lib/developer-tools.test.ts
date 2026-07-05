// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  base64Decode,
  base64Encode,
  compactJson,
  decodeJwt,
  formatJson,
  isoToUnix,
  jsonToYaml,
  parseArn,
  parseAzureResourceId,
  parseConnectionString,
  unixToIso,
  validateJson,
  validateYaml,
  yamlToJson,
} from "./developer-tools";

describe("developer-tools JSON helpers", () => {
  it("validates, formats, sorts, and compacts JSON", () => {
    expect(validateJson('{"b":2,"a":1}')).toEqual({ valid: true, message: "JSON is valid." });

    const formatted = formatJson('{"b":2,"a":{"d":4,"c":3}}', { sortKeys: true });
    expect(formatted).toEqual({
      ok: true,
      value: '{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 2\n}\n',
      message: "Formatted JSON.",
    });

    expect(compactJson('{\n "a": 1\n}')).toEqual({
      ok: true,
      value: '{"a":1}',
      message: "Compacted JSON.",
    });
  });

  it("returns parser errors for invalid JSON", () => {
    const result = validateJson("{bad");

    expect(result.valid).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("developer-tools YAML helpers", () => {
  it("validates and converts YAML to JSON", () => {
    expect(validateYaml("name: api\nreplicas: 2\n")).toEqual({
      valid: true,
      message: "YAML is valid.",
    });

    const result = yamlToJson("name: api\nreplicas: 2\n");
    expect(result).toEqual({
      ok: true,
      value: '{\n  "name": "api",\n  "replicas": 2\n}\n',
      message: "Converted YAML to JSON.",
    });
  });

  it("converts JSON to YAML", () => {
    const result = jsonToYaml('{"name":"api","replicas":2}');

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : "").toContain("name: api");
    expect(result.ok ? result.value : "").toContain("replicas: 2");
  });
});

describe("developer-tools encoders", () => {
  it("handles Base64 and time conversions", () => {
    const encoded = base64Encode("hello cloud");
    expect(base64Decode(encoded)).toEqual({ ok: true, value: "hello cloud" });
    expect(unixToIso("1700000000")).toEqual({ ok: true, value: "2023-11-14T22:13:20.000Z" });
    expect(isoToUnix("2023-11-14T22:13:20.000Z")).toEqual({ ok: true, value: "1700000000" });
  });

  it("decodes JWT payloads without verification", () => {
    const token = [
      base64Encode('{"alg":"none","typ":"JWT"}').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
      base64Encode('{"sub":"ali","role":"admin"}').replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
      "",
    ].join(".");

    const result = decodeJwt(token);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.verified : true).toBe(false);
    expect(result.ok ? result.value.payload : undefined).toEqual({ sub: "ali", role: "admin" });
  });
});

describe("developer-tools cloud parsers", () => {
  it("parses AWS ARNs", () => {
    expect(parseArn("arn:aws:lambda:eu-west-1:123456789012:function:orders-api")).toEqual({
      ok: true,
      value: {
        partition: "aws",
        service: "lambda",
        region: "eu-west-1",
        accountId: "123456789012",
        resource: "function:orders-api",
        resourceType: "function",
        resourceId: "orders-api",
      },
    });
  });

  it("parses Azure resource IDs", () => {
    const result = parseAzureResourceId(
      "/subscriptions/sub-001/resourceGroups/rg-prod/providers/Microsoft.Web/sites/api-prod/slots/staging",
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.subscriptionId : undefined).toBe("sub-001");
    expect(result.ok ? result.value.resourceGroup : undefined).toBe("rg-prod");
    expect(result.ok ? result.value.providerNamespace : undefined).toBe("Microsoft.Web");
    expect(result.ok ? result.value.resourceTypes : []).toEqual(["sites", "slots"]);
    expect(result.ok ? result.value.resourceNames : []).toEqual(["api-prod", "staging"]);
  });

  it("parses and masks connection strings", () => {
    const result = parseConnectionString("Server=db;User Id=app;Password=supersecret;Database=orders");

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.map((part) => [part.key, part.displayValue]) : []).toEqual([
      ["Server", "db"],
      ["User Id", "app"],
      ["Password", "su*******et"],
      ["Database", "orders"],
    ]);
  });
});
