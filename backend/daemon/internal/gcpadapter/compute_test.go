// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package gcpadapter

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
)

func TestListInstancesDecodesAndSorts(t *testing.T) {
	out := []byte(`[
		{
			"name": "zeta-vm",
			"zone": "https://www.googleapis.com/compute/v1/projects/platform-prod/zones/europe-west1-b",
			"machineType": "https://www.googleapis.com/compute/v1/projects/platform-prod/zones/europe-west1-b/machineTypes/e2-standard-2",
			"status": "RUNNING",
			"creationTimestamp": "2024-01-02T03:04:05.000-00:00",
			"networkInterfaces": [
				{
					"networkIP": "10.0.0.8",
					"accessConfigs": [{"natIP": "203.0.113.10"}]
				}
			]
		},
		{
			"name": "alpha-vm",
			"zone": "us-central1-a",
			"machineType": "e2-micro",
			"status": "TERMINATED",
			"creationTimestamp": "2023-06-01T12:00:00.000-00:00",
			"networkInterfaces": [{"networkIP": "10.128.0.2"}]
		}
	]`)
	fake := &fakeCLI{out: out}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	instances, err := inv.ListInstances(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListInstances: %v", err)
	}
	if len(instances) != 2 {
		t.Fatalf("len = %d, want 2: %+v", len(instances), instances)
	}
	if instances[0].Name != "alpha-vm" {
		t.Fatalf("first name = %q, want alpha-vm (sorted)", instances[0].Name)
	}
	if instances[0].Zone != "us-central1-a" || instances[0].MachineType != "e2-micro" {
		t.Fatalf("alpha instance = %+v", instances[0])
	}
	if instances[0].InternalIP != "10.128.0.2" || instances[0].ExternalIP != "" {
		t.Fatalf("alpha IPs = %+v", instances[0])
	}
	if instances[1].Name != "zeta-vm" {
		t.Fatalf("second name = %q, want zeta-vm", instances[1].Name)
	}
	if instances[1].Zone != "europe-west1-b" || instances[1].MachineType != "e2-standard-2" {
		t.Fatalf("zeta instance = %+v", instances[1])
	}
	if instances[1].Status != "RUNNING" || instances[1].ExternalIP != "203.0.113.10" {
		t.Fatalf("zeta status/ip = %+v", instances[1])
	}
	if fake.name != "gcloud" {
		t.Fatalf("command = %q, want gcloud", fake.name)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "--configuration=default") {
		t.Fatalf("args missing configuration: %v", fake.args)
	}
	if !strings.Contains(joined, "compute instances list") {
		t.Fatalf("args missing compute instances list: %v", fake.args)
	}
	if !strings.Contains(joined, "--project platform-prod") {
		t.Fatalf("args missing project: %v", fake.args)
	}
	if !strings.Contains(joined, "--format=json") {
		t.Fatalf("args missing format: %v", fake.args)
	}
}

func TestListInstancesEmptyPayload(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{out: []byte("[]")}
	instances, err := inv.ListInstances(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListInstances: %v", err)
	}
	if len(instances) != 0 {
		t.Fatalf("instances = %+v, want empty", instances)
	}
}

func TestListInstancesCLIError(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{err: errors.New("exit status 1")}
	_, err := inv.ListInstances(context.Background(), gcpProfile())
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "gcloud") {
		t.Fatalf("error = %v, want gcloud prefix", err)
	}
}

func TestResourceBasename(t *testing.T) {
	cases := map[string]string{
		"https://www.googleapis.com/compute/v1/projects/p/zones/us-central1-a": "us-central1-a",
		"e2-micro": "e2-micro",
		"  ":       "",
	}
	for input, want := range cases {
		if got := resourceBasename(input); got != want {
			t.Fatalf("resourceBasename(%q) = %q, want %q", input, got, want)
		}
	}
}
