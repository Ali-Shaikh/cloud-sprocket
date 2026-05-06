import {
  Badge,
  Box,
  Button,
  Cards,
  CollectionPreferences,
  Container,
  Header,
  PropertyFilter,
  RadioGroup,
  SpaceBetween,
  StatusIndicator,
  Table,
} from "@cloudscape-design/components";
import type { CardsProps, PropertyFilterProps, TableProps } from "@cloudscape-design/components";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
} from "../types/backend";
import type { CollectionField, TablePreferences } from "./shared";
import {
  useDeferredValue,
  useMemo,
} from "react";
import {
  badgeColour,
  countLabel,
  filterCollection,
  makeFilteringOptions,
  propertyFilterStrings,
  renderProfileDetailPanel,
  renderRuntimeSettingsPanel,
  statusType,
  useDebouncedValue,
  visibleColumnIds,
} from "./shared";

type Props = {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
  selectedProvider?: ProviderSummary;
  selectedProfile?: ProfileSummary;
  appSettings: AppSettingsSnapshot;
  latestLog?: ActivityLogEntry;
  loading: boolean;
  isTablet: boolean;
  showSensitiveValues: boolean;
  providerQuery: PropertyFilterProps.Query;
  profileQuery: PropertyFilterProps.Query;
  providerPreferences: TablePreferences;
  profilePreferences: TablePreferences;
  onToggleSensitiveValues: () => void;
  onProviderQueryChange: (query: PropertyFilterProps.Query) => void;
  onProfileQueryChange: (query: PropertyFilterProps.Query) => void;
  onProviderPreferencesChange: (preferences: TablePreferences) => void;
  onProfilePreferencesChange: (preferences: TablePreferences) => void;
  onRefreshDiscovery: () => void;
  onSelectProvider: (providerId: string) => void;
  onSelectProfile: (providerId: string, profileId: string) => void;
  onSelectAuthMethod: (authMethod: string) => void;
  onLockSession: () => void;
};

export default function SessionSetupView({
  providers,
  profiles,
  session,
  selectedProvider,
  selectedProfile,
  appSettings,
  latestLog,
  loading,
  isTablet,
  showSensitiveValues,
  providerQuery,
  profileQuery,
  providerPreferences,
  profilePreferences,
  onToggleSensitiveValues,
  onProviderQueryChange,
  onProfileQueryChange,
  onProviderPreferencesChange,
  onProfilePreferencesChange,
  onRefreshDiscovery,
  onSelectProvider,
  onSelectProfile,
  onSelectAuthMethod,
  onLockSession,
}: Props) {
  const debouncedProviderQuery = useDebouncedValue(providerQuery);
  const debouncedProfileQuery = useDebouncedValue(profileQuery);
  const deferredProviderQuery = useDeferredValue(debouncedProviderQuery);
  const deferredProfileQuery = useDeferredValue(debouncedProfileQuery);
  const providerResultsArePending = providerQuery !== debouncedProviderQuery;
  const profileResultsArePending = profileQuery !== debouncedProfileQuery;

  const providerFields: CollectionField<ProviderSummary>[] = useMemo(
    () => [
      { key: "provider", label: "Provider", getValue: (provider) => provider.label },
      { key: "state", label: "State", getValue: (provider) => provider.state },
      { key: "profiles", label: "Profiles", getValue: (provider) => provider.profileCount },
      { key: "summary", label: "Summary", getValue: (provider) => provider.summary },
      { key: "location", label: "Location", getValue: (provider) => provider.locations },
    ],
    [],
  );
  const profileFields: CollectionField<ProfileSummary>[] = useMemo(
    () => [
      { key: "name", label: "Profile", getValue: (profile) => profile.displayName },
      { key: "identifier", label: "Identifier", getValue: (profile) => profile.profileId },
      { key: "summary", label: "Summary", getValue: (profile) => profile.summary },
      { key: "source", label: "Source Path", getValue: (profile) => profile.sourcePaths },
    ],
    [],
  );

  const providerColumns: TableProps.ColumnDefinition<ProviderSummary>[] = [
    {
      id: "provider",
      header: "Provider",
      cell: (provider) => provider.label,
    },
    {
      id: "state",
      header: "State",
      cell: (provider) => (
        <StatusIndicator type={statusType(provider)}>{provider.state}</StatusIndicator>
      ),
    },
    {
      id: "profiles",
      header: "Profiles",
      cell: (provider) => provider.profileCount,
    },
    {
      id: "summary",
      header: "Summary",
      cell: (provider) => provider.summary,
    },
  ];

  const profileColumns: TableProps.ColumnDefinition<ProfileSummary>[] = [
    {
      id: "name",
      header: "Profile",
      cell: (profile) => profile.displayName,
    },
    {
      id: "identifier",
      header: "Identifier",
      cell: (profile) => profile.profileId,
    },
    {
      id: "summary",
      header: "Summary",
      cell: (profile) => profile.summary,
    },
  ];

  const filteredProviders = useMemo(
    () => filterCollection(providers, deferredProviderQuery, providerFields),
    [deferredProviderQuery, providerFields, providers],
  );
  const filteredProfiles = useMemo(
    () => filterCollection(profiles, deferredProfileQuery, profileFields),
    [deferredProfileQuery, profileFields, profiles],
  );
  const providerFilteringProperties: PropertyFilterProps.FilteringProperty[] =
    useMemo(() => providerFields.map((field) => ({
      key: field.key,
      propertyLabel: field.label,
      groupValuesLabel: `${field.label} values`,
      operators: [":", "!:", "=", "!="],
    })), [providerFields]);
  const profileFilteringProperties: PropertyFilterProps.FilteringProperty[] =
    useMemo(() => profileFields.map((field) => ({
      key: field.key,
      propertyLabel: field.label,
      groupValuesLabel: `${field.label} values`,
      operators: [":", "!:", "=", "!="],
    })), [profileFields]);
  const providerFilteringOptions = useMemo(
    () => makeFilteringOptions(providers, providerFields),
    [providerFields, providers],
  );
  const profileFilteringOptions = useMemo(
    () => makeFilteringOptions(profiles, profileFields),
    [profileFields, profiles],
  );
  const visibleProviderIds = visibleColumnIds(providerPreferences);
  const visibleProfileIds = visibleColumnIds(profilePreferences);
  const providerTableColumns = providerColumns.filter((column) =>
    visibleProviderIds.includes(String(column.id)),
  );
  const profileTableColumns = profileColumns.filter((column) =>
    visibleProfileIds.includes(String(column.id)),
  );
  const selectedProfileSummary = selectedProfile
    ? `${selectedProvider?.label ?? selectedProfile.providerId} / ${selectedProfile.displayName} / ${selectedProfile.summary || "No region"}`
    : "";
  const canLockWorkspace = Boolean(selectedProfile && session.selectedAuthMethod);

  const providerPreferencesControl = (
    <CollectionPreferences
      title="Provider Preferences"
      confirmLabel="Apply"
      cancelLabel="Cancel"
      preferences={providerPreferences}
      onConfirm={({ detail }) => {
        onProviderPreferencesChange(detail as TablePreferences);
      }}
      pageSizePreference={undefined}
      visibleContentPreference={{
        title: "Visible columns",
        options: [
          {
            label: "Provider columns",
            options: [
              { id: "provider", label: "Provider" },
              { id: "state", label: "State" },
              { id: "profiles", label: "Profiles" },
              { id: "summary", label: "Summary" },
            ],
          },
        ],
      }}
      wrapLinesPreference={{ label: "Wrap lines", description: "Wrap long text values." }}
      stripedRowsPreference={{ label: "Striped rows", description: "Alternate row shading." }}
    />
  );

  const profilePreferencesControl = (
    <CollectionPreferences
      title="Profile Preferences"
      confirmLabel="Apply"
      cancelLabel="Cancel"
      preferences={profilePreferences}
      onConfirm={({ detail }) => {
        onProfilePreferencesChange(detail as TablePreferences);
      }}
      pageSizePreference={undefined}
      visibleContentPreference={{
        title: "Visible columns",
        options: [
          {
            label: "Profile columns",
            options: [
              { id: "name", label: "Profile" },
              { id: "identifier", label: "Identifier" },
              { id: "summary", label: "Summary" },
            ],
          },
        ],
      }}
      wrapLinesPreference={{ label: "Wrap lines", description: "Wrap long text values." }}
      stripedRowsPreference={{ label: "Striped rows", description: "Alternate row shading." }}
    />
  );

  const providerFilterControl = (
    <PropertyFilter
      query={providerQuery}
      onChange={({ detail }) => {
        onProviderQueryChange(detail);
      }}
      countText={
        providerQuery.tokens.length
          ? providerResultsArePending
            ? "Updating matches"
            : countLabel(filteredProviders.length, "match", "matches")
          : undefined
      }
      filteringPlaceholder="Filter providers"
      filteringAriaLabel="Filter providers"
      filteringProperties={providerFilteringProperties}
      filteringOptions={providerFilteringOptions}
      i18nStrings={propertyFilterStrings}
    />
  );

  const profileFilterControl = (
    <PropertyFilter
      query={profileQuery}
      onChange={({ detail }) => {
        onProfileQueryChange(detail);
      }}
      countText={
        profileQuery.tokens.length
          ? profileResultsArePending
            ? "Updating matches"
            : countLabel(filteredProfiles.length, "match", "matches")
          : undefined
      }
      filteringPlaceholder="Filter profiles"
      filteringAriaLabel="Filter profiles"
      filteringProperties={profileFilteringProperties}
      filteringOptions={profileFilteringOptions}
      i18nStrings={propertyFilterStrings}
    />
  );

  const providerCards: CardsProps<ProviderSummary>["cardDefinition"] = {
    header: (provider) => provider.label,
    sections: [
      {
        id: "state",
        header: "State",
        content: (provider) => (
          <StatusIndicator type={statusType(provider)}>{provider.state}</StatusIndicator>
        ),
      },
      {
        id: "profiles",
        header: "Profiles",
        content: (provider) => countLabel(provider.profileCount, "profile", "profiles"),
      },
      {
        id: "summary",
        header: "Summary",
        content: (provider) => provider.summary,
      },
    ],
  };

  const profileCards: CardsProps<ProfileSummary>["cardDefinition"] = {
    header: (profile) => profile.displayName,
    sections: [
      {
        id: "identifier",
        header: "Identifier",
        content: (profile) => profile.profileId,
      },
      {
        id: "summary",
        header: "Summary",
        content: (profile) => profile.summary,
      },
    ],
  };

  const selectedProfileDetails = renderProfileDetailPanel(
    selectedProfile,
    "Profile Detail",
    "No profile selected yet.",
    "Choose a profile to inspect its attributes and source files.",
    showSensitiveValues,
    onToggleSensitiveValues,
  );

  const runtimeSettingsPanel = renderRuntimeSettingsPanel(
    appSettings,
    "Paths and platform data coming from the Go daemon.",
  );

  return (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container>
        <div className="page-heading">
          <div>
            <Box variant="awsui-key-label">Control Desktop</Box>
            <Header
              variant="h1"
              description="Pick a provider, profile, and auth path before locking the local workspace."
            >
              Session Setup
            </Header>
          </div>
          <div className="heading-metrics">
            <span>{countLabel(providers.length, "provider", "providers")}</span>
            <span>{countLabel(profiles.length, "profile", "profiles")}</span>
            <span>{session.selectedAuthMethod?.toUpperCase() ?? "No auth"}</span>
          </div>
        </div>
      </Container>

      <div className="setup-stage-grid">
        <Container
          header={
            <Header
              variant="h2"
              description="Step 1 of 3"
              actions={
                <Button
                  iconName="refresh"
                  onClick={onRefreshDiscovery}
                >
                  Refresh
                </Button>
              }
            >
              Choose Provider
            </Header>
          }
        >
          <SpaceBetween size="m">
            {isTablet ? (
              <Cards
                loading={loading}
                items={filteredProviders}
                cardDefinition={providerCards}
                cardsPerRow={[
                  { cards: 1 },
                  { minWidth: 700, cards: 2 },
                ]}
                selectionType="single"
                selectedItems={selectedProvider ? [selectedProvider] : []}
                trackBy="providerId"
                entireCardClickable
                filter={providerFilterControl}
                preferences={providerPreferencesControl}
                visibleSections={visibleProviderIds.filter((id) => id !== "provider")}
                empty={<Box color="text-status-inactive">No providers discovered yet.</Box>}
                onSelectionChange={({ detail }) => {
                  const provider = detail.selectedItems[0];
                  if (provider) {
                    onSelectProvider(provider.providerId);
                  }
                }}
              />
            ) : (
              <Table
                loading={loading}
                items={filteredProviders}
                columnDefinitions={providerTableColumns}
                selectionType="single"
                selectedItems={selectedProvider ? [selectedProvider] : []}
                trackBy="providerId"
                variant="embedded"
                wrapLines={providerPreferences.wrapLines}
                stripedRows={providerPreferences.stripedRows}
                contentDensity={providerPreferences.contentDensity}
                filter={providerFilterControl}
                preferences={providerPreferencesControl}
                empty={<Box color="text-status-inactive">No providers discovered yet.</Box>}
                onSelectionChange={({ detail }) => {
                  const provider = detail.selectedItems[0];
                  if (provider) {
                    onSelectProvider(provider.providerId);
                  }
                }}
              />
            )}
            {selectedProvider ? (
              <div className="selection-summary">
                <Badge color={badgeColour("info")}>Selected</Badge>
                <Box variant="p">{selectedProvider.summary}</Box>
              </div>
            ) : null}
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description={`Step 2 of 3${selectedProvider ? ` · ${selectedProvider.label}` : ""}`}
            >
              Choose Profile
            </Header>
          }
        >
          <SpaceBetween size="m">
            {isTablet ? (
              <Cards
                loading={loading}
                items={filteredProfiles}
                cardDefinition={profileCards}
                cardsPerRow={[
                  { cards: 1 },
                  { minWidth: 700, cards: 2 },
                ]}
                selectionType="single"
                selectedItems={selectedProfile ? [selectedProfile] : []}
                trackBy="profileId"
                entireCardClickable
                filter={profileFilterControl}
                preferences={profilePreferencesControl}
                visibleSections={visibleProfileIds.filter((id) => id !== "name")}
                empty={
                  <Box color="text-status-inactive">
                    No profiles visible for this provider.
                  </Box>
                }
                onSelectionChange={({ detail }) => {
                  const profile = detail.selectedItems[0];
                  if (profile) {
                    onSelectProfile(profile.providerId, profile.profileId);
                  }
                }}
              />
            ) : (
              <Table
                loading={loading}
                items={filteredProfiles}
                columnDefinitions={profileTableColumns}
                selectionType="single"
                selectedItems={selectedProfile ? [selectedProfile] : []}
                trackBy="profileId"
                variant="embedded"
                wrapLines={profilePreferences.wrapLines}
                stripedRows={profilePreferences.stripedRows}
                contentDensity={profilePreferences.contentDensity}
                filter={profileFilterControl}
                preferences={profilePreferencesControl}
                empty={
                  <Box color="text-status-inactive">
                    No profiles visible for this provider.
                  </Box>
                }
                onSelectionChange={({ detail }) => {
                  const profile = detail.selectedItems[0];
                  if (profile) {
                    onSelectProfile(profile.providerId, profile.profileId);
                  }
                }}
              />
            )}
            {selectedProfile ? (
              <div className="selection-summary">
                <Badge color={badgeColour("success")}>Selected</Badge>
                <Box variant="p">{selectedProfileSummary}</Box>
              </div>
            ) : null}
          </SpaceBetween>
        </Container>
      </div>

      <Container
        header={
          <Header
            variant="h2"
            description="Step 3 of 3"
          >
            Choose Authentication Path
          </Header>
        }
      >
        <SpaceBetween size="m">
          <RadioGroup
            value={session.selectedAuthMethod ?? null}
            items={session.availableAuthMethods.map((method) => ({
              value: method.method,
              label: method.label,
              description: method.summary,
              disabled: !method.available,
            }))}
            onChange={({ detail }) => {
              onSelectAuthMethod(detail.value);
            }}
          />
          <div className={`lock-next-step${canLockWorkspace ? " lock-next-step-ready" : ""}`}>
            <div className="lock-next-step-copy">
              <StatusIndicator type={canLockWorkspace ? "success" : "pending"}>
                {canLockWorkspace ? "Ready to lock" : "Waiting for selections"}
              </StatusIndicator>
              <strong>Lock workspace</strong>
              <span>
                {canLockWorkspace
                  ? "The selected profile and auth path are ready."
                  : "Choose a profile and auth path to continue."}
              </span>
            </div>
            <Button
              variant="primary"
              iconName="lock-private"
              disabled={!canLockWorkspace}
              onClick={onLockSession}
            >
              Lock Workspace
            </Button>
          </div>
          <div className="detail-grid">
            <div className="detail-card">
              <Box variant="awsui-key-label">Latest Activity</Box>
              <Box variant="p">{latestLog?.message ?? "No activity recorded yet."}</Box>
            </div>
          </div>
        </SpaceBetween>
      </Container>

      <div className="setup-grid">
        <Container
          header={
            <Header
              variant="h2"
              description="Selected profile context and auth capability."
            >
              Selected Context
            </Header>
          }
        >
          <SpaceBetween size="l">
            {selectedProfileDetails}
            {runtimeSettingsPanel}
          </SpaceBetween>
        </Container>
      </div>
    </SpaceBetween>
  );
}
