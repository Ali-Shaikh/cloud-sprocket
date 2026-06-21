package azureadapter

import (
	"context"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestListEntraUsersCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[{"displayName":"Ada Lovelace","userPrincipalName":"ada@contoso.com","id":"u1"}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	users, err := inv.ListEntraUsers(context.Background(), cloudAzureProfile())
	if err != nil {
		t.Fatalf("ListEntraUsers: %v", err)
	}
	if len(users) != 1 || users[0].DisplayName != "Ada Lovelace" || users[0].UserPrincipalName != "ada@contoso.com" {
		t.Fatalf("unexpected users: %+v", users)
	}
	if !strings.Contains(strings.Join(fake.args, " "), "ad user list") {
		t.Fatalf("unexpected az args: %v", fake.args)
	}
}

func TestEntraLocalFlociUnsupported(t *testing.T) {
	inv := newLocalInventory("http://localhost:4577")
	if _, err := inv.ListEntraUsers(context.Background(), localFlociProfile()); err == nil {
		t.Fatal("expected an error for Entra directory on floci-az")
	}
	if _, err := inv.ListEntraGroups(context.Background(), localFlociProfile()); err == nil {
		t.Fatal("expected an error for Entra groups on floci-az")
	}
}

func TestListEntraAppsCloud(t *testing.T) {
	fake := &fakeCLI{out: []byte(`[{"displayName":"my-api","appId":"app-1"}]`)}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	apps, err := inv.ListEntraAppRegistrations(context.Background(), cloudAzureProfile())
	if err != nil {
		t.Fatalf("ListEntraAppRegistrations: %v", err)
	}
	if len(apps) != 1 || apps[0].AppID != "app-1" {
		t.Fatalf("unexpected apps: %+v", apps)
	}
}
