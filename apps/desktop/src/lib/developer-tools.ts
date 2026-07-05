// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import * as yaml from "js-yaml";

export type ToolResult<T> =
  | { ok: true; value: T; message?: string }
  | { ok: false; error: string };

export type ValidationResult = {
  valid: boolean;
  message: string;
};

export type JwtDecodeResult = {
  header: unknown;
  payload: unknown;
  signaturePresent: boolean;
  verified: false;
};

export type ArnParts = {
  partition: string;
  service: string;
  region: string;
  accountId: string;
  resource: string;
  resourceType?: string;
  resourceId?: string;
};

export type AzureResourceIdParts = {
  subscriptionId?: string;
  resourceGroup?: string;
  providerNamespace?: string;
  resourceTypes: string[];
  resourceNames: string[];
  segments: Array<{ key: string; value: string }>;
};

export type ConnectionStringPart = {
  key: string;
  value: string;
  masked: boolean;
  displayValue: string;
};

const SECRET_KEY_PATTERN = /(password|pwd|secret|token|key|sas|sharedaccess|signature)/i;

export function jsonParseErrorMessage(error: unknown): string {
  if (error instanceof SyntaxError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function parseJson(input: string): ToolResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error: jsonParseErrorMessage(error) };
  }
}

export function validateJson(input: string): ValidationResult {
  const result = parseJson(input);
  if (!result.ok) {
    return { valid: false, message: result.error };
  }
  return { valid: true, message: "JSON is valid." };
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJsonValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function formatJson(input: string, options: { sortKeys?: boolean } = {}): ToolResult<string> {
  const result = parseJson(input);
  if (!result.ok) {
    return result;
  }
  const value = options.sortKeys ? sortJsonValue(result.value) : result.value;
  return { ok: true, value: `${JSON.stringify(value, null, 2)}\n`, message: "Formatted JSON." };
}

export function compactJson(input: string): ToolResult<string> {
  const result = parseJson(input);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: JSON.stringify(result.value), message: "Compacted JSON." };
}

export function parseYaml(input: string): ToolResult<unknown> {
  try {
    return { ok: true, value: yaml.load(input) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function validateYaml(input: string): ValidationResult {
  const result = parseYaml(input);
  if (!result.ok) {
    return { valid: false, message: result.error };
  }
  return { valid: true, message: "YAML is valid." };
}

export async function prettierFormatJson(input: string): Promise<ToolResult<string>> {
  const result = parseJson(input);
  if (!result.ok) {
    return result;
  }
  try {
    const [prettier, prettierBabel, prettierEstree] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
    ]);
    const formatted = await prettier.format(input, {
      parser: "json",
      plugins: [prettierBabel, prettierEstree],
    });
    return { ok: true, value: formatted, message: "Formatted JSON." };
  } catch {
    return formatJson(input);
  }
}

export async function formatYaml(input: string): Promise<ToolResult<string>> {
  const result = parseYaml(input);
  if (!result.ok) {
    return result;
  }
  try {
    const [prettier, prettierYaml] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/yaml"),
    ]);
    const formatted = await prettier.format(input, {
      parser: "yaml",
      plugins: [prettierYaml],
    });
    return { ok: true, value: formatted, message: "Formatted YAML." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function jsonToYaml(input: string): ToolResult<string> {
  const result = parseJson(input);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: yaml.dump(result.value, { lineWidth: 100, noRefs: true }),
    message: "Converted JSON to YAML.",
  };
}

export function yamlToJson(input: string): ToolResult<string> {
  const result = parseYaml(input);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: `${JSON.stringify(result.value, null, 2)}\n`,
    message: "Converted YAML to JSON.",
  };
}

function binaryFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return binary;
}

function bytesFromBinary(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64Encode(input: string): string {
  return btoa(binaryFromBytes(new TextEncoder().encode(input)));
}

export function base64Decode(input: string): ToolResult<string> {
  try {
    const binary = atob(input.trim());
    return { ok: true, value: new TextDecoder().decode(bytesFromBinary(binary)) };
  } catch {
    return { ok: false, error: "Input is not valid Base64." };
  }
}

function normaliseBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
}

function decodeBase64UrlJson(input: string): unknown {
  const decoded = base64Decode(normaliseBase64Url(input));
  if (!decoded.ok) {
    throw new Error(decoded.error);
  }
  return JSON.parse(decoded.value);
}

export function decodeJwt(token: string): ToolResult<JwtDecodeResult> {
  const parts = token.trim().split(".");
  if (parts.length < 2 || parts.length > 3) {
    return { ok: false, error: "JWT must have header, payload, and optional signature parts." };
  }
  try {
    return {
      ok: true,
      value: {
        header: decodeBase64UrlJson(parts[0] ?? ""),
        payload: decodeBase64UrlJson(parts[1] ?? ""),
        signaturePresent: Boolean(parts[2]),
        verified: false,
      },
      message: "Decoded JWT. Signature is not verified.",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

export function urlDecode(input: string): ToolResult<string> {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch {
    return { ok: false, error: "Input is not valid URL-encoded text." };
  }
}

export function unixToIso(input: string): ToolResult<string> {
  const numeric = Number(input.trim());
  if (!Number.isFinite(numeric)) {
    return { ok: false, error: "Enter a numeric UNIX timestamp." };
  }
  const millis = Math.abs(numeric) < 100_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "Timestamp is outside the supported date range." };
  }
  return { ok: true, value: date.toISOString() };
}

export function isoToUnix(input: string): ToolResult<string> {
  const date = new Date(input.trim());
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "Enter a valid ISO date or date-time." };
  }
  return { ok: true, value: String(Math.floor(date.getTime() / 1000)) };
}

export async function sha256Hex(input: string): Promise<ToolResult<string>> {
  if (!globalThis.crypto?.subtle) {
    return { ok: false, error: "SHA-256 is unavailable in this runtime." };
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = Array.from(new Uint8Array(digest));
  return {
    ok: true,
    value: bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  };
}

export function parseArn(input: string): ToolResult<ArnParts> {
  const parts = input.trim().split(":");
  if (parts.length < 6 || parts[0] !== "arn") {
    return { ok: false, error: "Enter a valid AWS ARN." };
  }
  const resource = parts.slice(5).join(":");
  if (!parts[1] || !parts[2] || !resource) {
    return { ok: false, error: "ARN is missing a partition, service, or resource." };
  }
  const slashIndex = resource.indexOf("/");
  const colonIndex = resource.indexOf(":");
  const splitIndex =
    slashIndex === -1 ? colonIndex : colonIndex === -1 ? slashIndex : Math.min(slashIndex, colonIndex);
  return {
    ok: true,
    value: {
      partition: parts[1] ?? "",
      service: parts[2] ?? "",
      region: parts[3] ?? "",
      accountId: parts[4] ?? "",
      resource,
      resourceType: splitIndex > 0 ? resource.slice(0, splitIndex) : undefined,
      resourceId: splitIndex > 0 ? resource.slice(splitIndex + 1) : resource,
    },
  };
}

export function parseAzureResourceId(input: string): ToolResult<AzureResourceIdParts> {
  const segments = input.trim().split("/").filter(Boolean);
  if (segments.length < 2 || segments[0]?.toLowerCase() !== "subscriptions") {
    return { ok: false, error: "Enter an Azure resource ID beginning with /subscriptions/." };
  }
  const pairs: Array<{ key: string; value: string }> = [];
  for (let index = 0; index < segments.length; index += 2) {
    pairs.push({ key: segments[index] ?? "", value: segments[index + 1] ?? "" });
  }
  const subscriptionId = pairs.find((pair) => pair.key.toLowerCase() === "subscriptions")?.value;
  const resourceGroup = pairs.find((pair) => pair.key.toLowerCase() === "resourcegroups")?.value;
  const providerIndex = segments.findIndex((segment) => segment.toLowerCase() === "providers");
  const providerNamespace = providerIndex >= 0 ? segments[providerIndex + 1] : undefined;
  const providerSegments = providerIndex >= 0 ? segments.slice(providerIndex + 2) : [];
  const resourceTypes: string[] = [];
  const resourceNames: string[] = [];
  for (let index = 0; index < providerSegments.length; index += 2) {
    const type = providerSegments[index];
    const name = providerSegments[index + 1];
    if (type) {
      resourceTypes.push(type);
    }
    if (name) {
      resourceNames.push(name);
    }
  }
  return {
    ok: true,
    value: {
      subscriptionId,
      resourceGroup,
      providerNamespace,
      resourceTypes,
      resourceNames,
      segments: pairs,
    },
  };
}

export function parseConnectionString(input: string): ToolResult<ConnectionStringPart[]> {
  const parts = input
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 1) {
        return null;
      }
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      const masked = SECRET_KEY_PATTERN.test(key);
      return {
        key,
        value,
        masked,
        displayValue: masked ? maskSecret(value) : value,
      } satisfies ConnectionStringPart;
    })
    .filter((part): part is ConnectionStringPart => part !== null);
  if (parts.length === 0) {
    return { ok: false, error: "No key=value pairs found." };
  }
  return { ok: true, value: parts };
}

export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return value.length === 0 ? "" : "****";
  }
  return `${value.slice(0, 2)}${"*".repeat(Math.min(12, value.length - 4))}${value.slice(-2)}`;
}
