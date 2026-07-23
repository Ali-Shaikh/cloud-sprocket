// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package main

import (
	"context"
	"log"
	"os"
	"os/exec"

	"cloudsprocket/backend/daemon/internal/app"
	"cloudsprocket/backend/daemon/internal/awsadapter"
	"cloudsprocket/backend/daemon/internal/azureadapter"
	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/dockerruntime"
	"cloudsprocket/backend/daemon/internal/rpc"
	"cloudsprocket/backend/daemon/internal/store"
	"cloudsprocket/backend/daemon/internal/sysenv"
)

func main() {
	sysenv.EnsureDeveloperPath()
	settings := config.Default()
	if err := settings.EnsureRuntimeDirs(); err != nil {
		log.Fatalf("failed to prepare runtime directories: %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		log.Fatalf("failed to open sqlite store: %v", err)
	}
	defer dataStore.Close()
	diagnostics, err := os.OpenFile(settings.LogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		log.Fatalf("failed to open diagnostics log: %v", err)
	}
	defer diagnostics.Close()
	diagnosticLogger := log.New(diagnostics, "", log.Ldate|log.Ltime|log.LUTC)

	discoveryService := discovery.New(settings, exec.LookPath)
	service := app.NewFromDeps(app.Deps{
		Settings:       settings,
		Store:          dataStore,
		Discovery:      discoveryService,
		S3:             awsadapter.NewS3Inventory(settings),
		EC2:            awsadapter.NewEC2Inventory(settings),
		Lambda:         awsadapter.NewLambdaInventory(settings),
		DynamoDB:       awsadapter.NewDynamoDBInventory(settings),
		SQS:            awsadapter.NewSQSInventory(settings),
		SNS:            awsadapter.NewSNSInventory(settings),
		RDS:            awsadapter.NewRDSInventory(settings),
		ECS:            awsadapter.NewECSInventory(settings),
		EKS:            awsadapter.NewEKSInventory(settings),
		CloudFormation: awsadapter.NewCloudFormationInventory(settings),
		EventBridge:    awsadapter.NewEventBridgeInventory(settings),
		Route53:        awsadapter.NewRoute53Inventory(settings),
		Elbv2:          awsadapter.NewElbv2Inventory(settings),
		Kms:            awsadapter.NewKmsInventory(settings),
		ApiGateway:     awsadapter.NewApiGatewayInventory(settings),
		SecretsManager: awsadapter.NewSecretsManagerInventory(settings),
		Logs:           awsadapter.NewLogsInventory(settings),
		IAM:            awsadapter.NewIAMInventory(settings),
		Azure:          azureadapter.NewInventory(settings),
		Docker:         dockerruntime.New(settings),
		// LocalStack and AzureRuntime left nil so NewFromDeps applies defaults.
	})
	if err := service.InitialisationError(); err != nil {
		log.Fatal("failed to initialise secret storage; verify the key file and its permissions")
	}
	server := rpc.NewWithLogger(service, diagnosticLogger)

	if err := server.Serve(context.Background(), os.Stdin, os.Stdout); err != nil {
		log.Fatalf("rpc server stopped: %v", err)
	}
}
