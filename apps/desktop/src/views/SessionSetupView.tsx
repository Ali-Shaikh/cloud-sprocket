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
  badgeColour,
  countLabel,
  filterCollection,
  makeFilteringOptions,
  propertyFilterStrings,
  renderProfileDetailPanel,
  renderRuntimeSettingsPanel,
  statusType,
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
  splitPanelOpen: boolean;
  providerQuery: PropertyFilterProps.Query;
  profileQuery: PropertyFilterProps.Query;
  providerPreferences: TablePreferences;
  profilePreferences: TablePreferences;
  onToggleSensitiveValues: () => void;
  onToggleSplitPanel: () => void;
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
  splitPanelOpen,
  providerQuery,
  profileQuery,
  providerPreferences,
  profilePreferences,
  onToggleSensitiveValues,
  onToggleSplitPanel,
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
  const providerFields: CollectionField<ProviderSummary>[] = [
    { key: "provider", label: "Provider", getValue: (provider) => provider.label },
    { key: "state", label: "State", getValue: (provider) => provider.state },
    { key: "profiles", label: "Profiles", getValue: (provider) => provider.profileCount },
    { key: "summary", label: "Summary", getValue: (provider) => provider.summary },
    { key: "location", label: "Location", getValue: (provider) => provider.locations },
  ];
  const profileFields: CollectionField<ProfileSummary>[] = [
    { key: "name", label: "Profile", getValue: (profile) => profile.displayName },
    { key: "identifier", label: "Identifier", getValue: (profile) => profile.profileId },
    { key: "summary", label: "Summary", getValue: (profile) => profile.summary },
    { key: "source", label: "Source Path", getValue: (profile) => profile.sourcePaths },
  ];

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

  const filteredProviders = filterCollection(providers, providerQuery, providerFields);
  const filteredProfiles = filterCollection(profiles, profileQuery, profileFields);
  const providerFilteringProperties: PropertyFilterProps.FilteringProperty[] =
    providerFields.map((field) => ({
      key: field.key,
      propertyLabel: field.label,
      groupValuesLabel: `${field.label} values`,
      operators: [":", "!:", "=", "!="],
    }));
  const profileFilteringProperties: PropertyFilterProps.FilteringProperty[] =
    profileFields.map((field) => ({
      key: field.key,
      propertyLabel: field.label,
      groupValuesLabel: `${field.label} values`,
      operators: [":", "!:", "=", "!="],
    }));
  const providerFilteringOptions = makeFilteringOptions(providers, providerFields);
  const profileFilteringOptions = makeFilteringOptions(profiles, profileFields);
  const visibleProviderIds = visibleColumnIds(providerPreferences);
  const visibleProfileIds = visibleColumnIds(profilePreferences);
  const providerTableColumns = providerColumns.filter((column) =>
    visibleProviderIds.includes(String(column.id)),
  );
  const profileTableColumns = profileColumns.filter((column) =>
    visibleProfileIds.includes(String(column.id)),
  );

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
          ? countLabel(filteredProviders.length, "match", "matches")
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
          ? countLabel(filteredProfiles.length, "match", "matches")
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
        <div className="hero-banner">
          <div>
            <Box variant="awsui-key-label">Control Desktop</Box>
            <Header
              variant="h1"
              description="Move through provider selection, profile selection, auth choice, and lock review in one deliberate flow."
            >
              Session Setup
            </Header>
            <Box color="text-body-secondary">
              AWS remains the full milestone 1 target. Azure and GCP stay visible
              here as discovery-only surfaces.
            </Box>
          </div>
          <div className="hero-metrics">
            <div className="hero-metric">
              <span className="hero-metric-value">{providers.length}</span>
              <span className="hero-metric-label">Providers</span>
            </div>
            <div className="hero-metric">
              <span className="hero-metric-value">{profiles.length}</span>
              <span className="hero-metric-label">Profiles</span>
            </div>
            <div className="hero-metric">
              <span className="hero-metric-value">
                {session.selectedAuthMethod?.toUpperCase() ?? "NONE"}
              </span>
              <span className="hero-metric-label">Auth Path</span>
            </div>
            <div className="hero-metric">
              <span className="hero-metric-value">
                {selectedProfile ? "READY" : "WAITING"}
              </span>
              <span className="hero-metric-label">Lock State</span>
            </div>
          </div>
        </div>
      </Container>

      <div className="setup-stage-grid">
        <Container
          header={
            <Header
              variant="h2"
              description="Step 1 of 4"
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
              description={`Step 2 of 4${selectedProvider ? ` · ${selectedProvider.label}` : ""}`}
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
                <Box variant="p">{selectedProfile.summary}</Box>
              </div>
            ) : null}
          </SpaceBetween>
        </Container>
      </div>

      <div className="setup-stage-grid">
        <Container
          header={
            <Header
              variant="h2"
              description="Step 3 of 4"
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
            <Box color="text-body-secondary">
              Pick the auth flow that the locked workspace should use for Overview,
              S3, EC2, and Actions.
            </Box>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Step 4 of 4"
            >
              Review And Lock
            </Header>
          }
          footer={
            <div className="session-actions">
              <Button onClick={onToggleSplitPanel}>
                {splitPanelOpen ? "Hide Activity" : "Show Activity"}
              </Button>
              <Button
                variant="primary"
                disabled={!selectedProfile || !session.selectedAuthMethod}
                onClick={onLockSession}
              >
                Lock Session
              </Button>
            </div>
          }
        >
          <div className="detail-grid">
            <div className="detail-card detail-card-strong">
              <Box variant="awsui-key-label">Provider</Box>
              <Box variant="p">{selectedProvider?.label ?? "Choose a provider"}</Box>
            </div>
            <div className="detail-card detail-card-strong">
              <Box variant="awsui-key-label">Profile</Box>
              <Box variant="p">{selectedProfile?.displayName ?? "Choose a profile"}</Box>
            </div>
            <div className="detail-card detail-card-strong">
              <Box variant="awsui-key-label">Auth Path</Box>
              <Box variant="p">{session.selectedAuthMethod?.toUpperCase() ?? "Choose auth"}</Box>
            </div>
            <div className="detail-card">
              <Box variant="awsui-key-label">Latest Activity</Box>
              <Box variant="p">{latestLog?.message ?? "No activity recorded yet."}</Box>
            </div>
          </div>
        </Container>
      </div>

      <div className="setup-grid">
        <Container
          header={
            <Header
              variant="h2"
              description="Selected profile context and auth capability."
            >
              Review Details
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
