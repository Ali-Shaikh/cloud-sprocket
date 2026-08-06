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

func TestListClustersDecodesAndSorts(t *testing.T) {
	out := []byte(`[
		{
			"name": "zeta-gke",
			"location": "europe-west1",
			"status": "RUNNING",
			"currentMasterVersion": "1.29.4-gke.1043002",
			"currentNodeCount": 3,
			"endpoint": "203.0.113.10",
			"createTime": "2024-01-02T03:04:05Z",
			"autopilot": {"enabled": true}
		},
		{
			"name": "alpha-gke",
			"location": "us-central1-a",
			"status": "RUNNING",
			"currentMasterVersion": "1.28.11-gke.1019001",
			"currentNodeCount": 2,
			"endpoint": "203.0.113.20",
			"createTime": "2023-06-01T12:00:00Z"
		}
	]`)
	fake := &fakeCLI{out: out}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	clusters, err := inv.ListClusters(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListClusters: %v", err)
	}
	if len(clusters) != 2 {
		t.Fatalf("len = %d, want 2: %+v", len(clusters), clusters)
	}
	if clusters[0].Name != "alpha-gke" {
		t.Fatalf("first name = %q, want alpha-gke (sorted)", clusters[0].Name)
	}
	if clusters[0].Location != "us-central1-a" || clusters[0].Mode != "Standard" {
		t.Fatalf("alpha cluster = %+v", clusters[0])
	}
	if clusters[0].NodeCount != 2 || clusters[0].MasterVersion == "" {
		t.Fatalf("alpha counts/version = %+v", clusters[0])
	}
	if clusters[1].Name != "zeta-gke" || clusters[1].Mode != "Autopilot" {
		t.Fatalf("zeta cluster = %+v", clusters[1])
	}
	if clusters[1].Status != "RUNNING" || clusters[1].Endpoint != "203.0.113.10" {
		t.Fatalf("zeta status/endpoint = %+v", clusters[1])
	}
	if fake.name != "gcloud" {
		t.Fatalf("command = %q, want gcloud", fake.name)
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "--configuration=default") {
		t.Fatalf("args missing configuration: %v", fake.args)
	}
	if !strings.Contains(joined, "container clusters list") {
		t.Fatalf("args missing container clusters list: %v", fake.args)
	}
	if !strings.Contains(joined, "--project platform-prod") {
		t.Fatalf("args missing project: %v", fake.args)
	}
	if !strings.Contains(joined, "--format=json") {
		t.Fatalf("args missing format: %v", fake.args)
	}
}

func TestListClustersEmptyPayload(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{out: []byte("[]")}
	clusters, err := inv.ListClusters(context.Background(), gcpProfile())
	if err != nil {
		t.Fatalf("ListClusters: %v", err)
	}
	if len(clusters) != 0 {
		t.Fatalf("clusters = %+v, want empty", clusters)
	}
}

func TestListClustersCLIError(t *testing.T) {
	inv := NewInventory(config.Settings{})
	inv.runner = &fakeCLI{err: errors.New("exit status 1")}
	_, err := inv.ListClusters(context.Background(), gcpProfile())
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "gcloud") {
		t.Fatalf("error = %v, want gcloud prefix", err)
	}
}

func TestListNodePoolsRequiresClusterAndLocation(t *testing.T) {
	inv := NewInventory(config.Settings{})
	if _, err := inv.ListNodePools(context.Background(), gcpProfile(), "", "us-central1"); err == nil {
		t.Fatal("expected error for empty cluster")
	}
	if _, err := inv.ListNodePools(context.Background(), gcpProfile(), "alpha", ""); err == nil {
		t.Fatal("expected error for empty location")
	}
}

func TestListNodePoolsDecodesAndSorts(t *testing.T) {
	out := []byte(`[
		{
			"name": "zeta-pool",
			"status": "RUNNING",
			"version": "1.29.4-gke.1043002",
			"initialNodeCount": 3,
			"locations": ["us-central1-a"],
			"config": {"machineType": "e2-medium", "diskSizeGb": 100},
			"autoscaling": {"enabled": true, "minNodeCount": 1, "maxNodeCount": 5}
		},
		{
			"name": "alpha-pool",
			"status": "RUNNING",
			"version": "1.29.4-gke.1043002",
			"initialNodeCount": 2,
			"locations": ["us-central1-a", "us-central1-b"],
			"config": {"machineType": "e2-standard-4", "diskSizeGb": 50}
		}
	]`)
	fake := &fakeCLI{out: out}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	pools, err := inv.ListNodePools(context.Background(), gcpProfile(), "alpha-gke", "us-central1")
	if err != nil {
		t.Fatalf("ListNodePools: %v", err)
	}
	if len(pools) != 2 {
		t.Fatalf("len = %d, want 2: %+v", len(pools), pools)
	}
	if pools[0].Name != "alpha-pool" {
		t.Fatalf("first name = %q, want alpha-pool (sorted)", pools[0].Name)
	}
	if pools[0].MachineType != "e2-standard-4" || pools[0].InitialNodeCount != 2 {
		t.Fatalf("alpha pool = %+v", pools[0])
	}
	if !pools[1].AutoscalingEnabled || pools[1].MaxNodeCount != 5 {
		t.Fatalf("zeta pool = %+v", pools[1])
	}
	joined := strings.Join(fake.args, " ")
	if !strings.Contains(joined, "container node-pools list") {
		t.Fatalf("args missing node-pools list: %v", fake.args)
	}
	if !strings.Contains(joined, "--cluster alpha-gke") {
		t.Fatalf("args missing cluster: %v", fake.args)
	}
	if !strings.Contains(joined, "--location us-central1") {
		t.Fatalf("args missing location: %v", fake.args)
	}
}
