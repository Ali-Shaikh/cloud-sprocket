import {
  Badge,
  Box,
  Button,
  Container,
  Header,
  SpaceBetween,
  StatusIndicator,
} from "@cloudscape-design/components";
import type {
  CollectionPreferencesProps,
  PropertyFilterProps,
  TabsProps,
} from "@cloudscape-design/components";
import type { ReactNode } from "react";
import {
  useEffect,
  useState,
} from "react";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  ProfileSummary,
  ProviderSummary,
  WorkspaceTab,
} from "../types/backend";

export function statusType(
  provider: ProviderSummary,
): "success" | "warning" | "error" {
  if (provider.state === "configured") {
    return "success";
  }
  if (provider.state === "tooling-only") {
    return "warning";
  }
  return "error";
}

export function badgeColour(
  level: ActivityLogEntry["level"],
): "blue" | "green" | "grey" | "red" {
  if (level === "success") {
    return "green";
  }
  if (level === "warning") {
    return "grey";
  }
  if (level === "error") {
    return "red";
  }
  return "blue";
}

export function countLabel(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type CollectionField<T> = {
  key: string;
  label: string;
  getValue: (item: T) => string | number | ReadonlyArray<string> | undefined;
};

export type TablePreferences = Required<
  Pick<
    CollectionPreferencesProps.Preferences,
    "wrapLines" | "stripedRows" | "contentDensity" | "contentDisplay"
  >
>;

export const propertyFilterStrings: PropertyFilterProps.I18nStrings = {
  filteringAriaLabel: "Filter items",
  dismissAriaLabel: "Dismiss",
  clearAriaLabel: "Clear",
  clearFiltersText: "Clear filters",
  groupValuesText: "Values",
  groupPropertiesText: "Properties",
  operatorsText: "Operators",
  operationAndText: "and",
  operationOrText: "or",
  operatorContainsText: "Contains",
  operatorDoesNotContainText: "Does not contain",
  operatorEqualsText: "Equals",
  operatorDoesNotEqualText: "Does not equal",
  editTokenHeader: "Edit filter",
  propertyText: "Property",
  operatorText: "Operator",
  valueText: "Value",
  cancelActionText: "Cancel",
  applyActionText: "Apply",
  allPropertiesLabel: "All properties",
  tokenLimitShowMore: "Show more",
  tokenLimitShowFewer: "Show fewer",
  enteredTextLabel: (text) => `Use: ${text}`,
};

export function defaultQuery(): PropertyFilterProps.Query {
  return {
    operation: "and",
    tokens: [],
  };
}

export function useDebouncedValue<T>(value: T, delayMs = 180): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

function normaliseValue(
  value: string | number | ReadonlyArray<string> | undefined,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => entry.toLowerCase());
  }
  return [String(value).toLowerCase()];
}

function matchesTokenValue(
  values: string[],
  token: PropertyFilterProps.Token,
): boolean {
  const tokenValue = String(token.value ?? "").toLowerCase();
  if (!tokenValue) {
    return true;
  }

  if (token.operator === "=") {
    return values.some((value) => value === tokenValue);
  }
  if (token.operator === "!=") {
    return values.every((value) => value !== tokenValue);
  }
  if (token.operator === "!:") {
    return values.every((value) => !value.includes(tokenValue));
  }
  return values.some((value) => value.includes(tokenValue));
}

export function filterCollection<T>(
  items: T[],
  query: PropertyFilterProps.Query,
  fields: ReadonlyArray<CollectionField<T>>,
): T[] {
  if (query.tokens.length === 0) {
    return items;
  }

  return items.filter((item) => {
    const tokenMatches = query.tokens.map((token) => {
      if (!token.propertyKey) {
        const aggregateValues = fields.flatMap((field) =>
          normaliseValue(field.getValue(item)),
        );
        return matchesTokenValue(aggregateValues, token);
      }

      const field = fields.find((candidate) => candidate.key === token.propertyKey);
      if (!field) {
        return true;
      }
      return matchesTokenValue(normaliseValue(field.getValue(item)), token);
    });

    return query.operation === "or"
      ? tokenMatches.some(Boolean)
      : tokenMatches.every(Boolean);
  });
}

export function makeFilteringOptions<T>(
  items: T[],
  fields: ReadonlyArray<CollectionField<T>>,
): PropertyFilterProps.FilteringOption[] {
  return fields.flatMap((field) => {
    const options = new Set<string>();
    items.forEach((item) => {
      normaliseValue(field.getValue(item)).forEach((value) => {
        if (value) {
          options.add(value);
        }
      });
    });
    return Array.from(options)
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({
        propertyKey: field.key,
        value,
      }));
  });
}

export function visibleColumnIds(preferences: TablePreferences): string[] {
  return preferences.contentDisplay
    .filter((column) => column.visible)
    .map((column) => column.id);
}

export function renderProfileDetailPanel(
  profile: ProfileSummary | undefined,
  title: string,
  emptyMessage: string,
  description: string,
  showSensitiveValues: boolean,
  onToggleSensitiveValues: () => void,
): ReactNode {
  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <Button
              disabled={!profile?.attributes.some((attribute) => attribute.sensitive)}
              onClick={onToggleSensitiveValues}
            >
              {showSensitiveValues ? "Hide Sensitive Values" : "Reveal Sensitive Values"}
            </Button>
          }
          description={
            profile
              ? `${profile.displayName} from ${profile.providerId.toUpperCase()}`
              : description
          }
        >
          {title}
        </Header>
      }
    >
      {profile ? (
        <SpaceBetween size="m">
          <div className="detail-grid">
            {profile.attributes.map((attribute) => (
              <div
                key={`${attribute.label}-${attribute.value}`}
                className="detail-card"
              >
                <Box variant="awsui-key-label">{attribute.label}</Box>
                <Box variant="p">
                  {attribute.sensitive && !showSensitiveValues
                    ? "Hidden until revealed"
                    : attribute.value}
                </Box>
              </div>
            ))}
          </div>
          <div className="detail-grid">
            {profile.authMethods.map((method) => (
              <div
                key={method.method}
                className="detail-card"
              >
                <Box variant="awsui-key-label">{method.label}</Box>
                <StatusIndicator type={method.available ? "success" : "warning"}>
                  {method.available ? "Available" : "Unavailable"}
                </StatusIndicator>
                <Box color="text-body-secondary">{method.summary}</Box>
              </div>
            ))}
          </div>
          <div className="path-list">
            <Box variant="awsui-key-label">Source Paths</Box>
            {profile.sourcePaths.map((sourcePath) => (
              <Box
                key={sourcePath}
                variant="code"
              >
                {sourcePath}
              </Box>
            ))}
          </div>
        </SpaceBetween>
      ) : (
        <Box color="text-status-inactive">{emptyMessage}</Box>
      )}
    </Container>
  );
}

export function renderRuntimeSettingsPanel(
  settings: AppSettingsSnapshot,
  description: string,
): ReactNode {
  return (
    <Container
      header={
        <Header
          variant="h2"
          description={description}
        >
          Runtime Settings
        </Header>
      }
    >
      <div className="detail-grid">
        <div className="detail-card">
          <Box variant="awsui-key-label">Platform</Box>
          <Box variant="p">{settings.platformName || "Unknown"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Runtime Mode</Box>
          <Box variant="p">{settings.runtimeMode || "cloud"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Config Root</Box>
          <Box variant="code">{settings.configDir || "Unavailable"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Database</Box>
          <Box variant="code">{settings.databasePath || "Unavailable"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Log Path</Box>
          <Box variant="code">{settings.logPath || "Unavailable"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Local Config Root</Box>
          <Box variant="code">{settings.localConfigDir || "Unavailable"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Emulator State Root</Box>
          <Box variant="code">{settings.emulatorStateDir || "Unavailable"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">LocalStack Image</Box>
          <Box variant="code">{settings.localStackImage || "localstack/localstack:stable"}</Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">floci-az Image</Box>
          <Box variant="code">{settings.flociAzImage || "floci/floci-az:latest"}</Box>
        </div>
      </div>
    </Container>
  );
}

export function renderLogEntries(entries: ActivityLogEntry[]): ReactNode {
  if (entries.length === 0) {
    return <Box color="text-status-inactive">No activity recorded yet.</Box>;
  }

  return entries.map((entry) => (
    <div
      key={entry.id}
      className={`log-entry log-entry-${entry.level}`}
    >
      <div className="log-entry-meta">
        <span>{new Date(entry.timestamp).toLocaleString()}</span>
        <Badge color={badgeColour(entry.level)}>{entry.level}</Badge>
      </div>
      <div>{entry.message}</div>
      {entry.details ? (
        <Box
          variant="small"
          color="text-body-secondary"
        >
          {entry.details}
        </Box>
      ) : null}
    </div>
  ));
}

export function makeWorkspaceTab(tab: WorkspaceTab): TabsProps.Tab {
  return {
    id: tab.tabId,
    label: tab.label,
    content: (
      <Container
        header={
          <Header
            variant="h2"
            description={tab.summary}
          >
            {tab.label}
          </Header>
        }
      >
        <SpaceBetween size="m">
          <Box variant="p">{tab.detail}</Box>
          <Box color="text-body-secondary">
            This view is wired into the new workspace contract now, with the old
            Python controller being replaced slice by slice behind it.
          </Box>
        </SpaceBetween>
      </Container>
    ),
  };
}
