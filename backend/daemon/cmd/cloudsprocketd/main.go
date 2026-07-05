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

	discoveryService := discovery.New(settings, exec.LookPath)
	s3Inventory := awsadapter.NewS3Inventory(settings)
	ec2Inventory := awsadapter.NewEC2Inventory(settings)
	lambdaInventory := awsadapter.NewLambdaInventory(settings)
	dynamodbInventory := awsadapter.NewDynamoDBInventory(settings)
	sqsInventory := awsadapter.NewSQSInventory(settings)
	snsInventory := awsadapter.NewSNSInventory(settings)
	rdsInventory := awsadapter.NewRDSInventory(settings)
	ecsInventory := awsadapter.NewECSInventory(settings)
	eksInventory := awsadapter.NewEKSInventory(settings)
	cloudformationInventory := awsadapter.NewCloudFormationInventory(settings)
	eventbridgeInventory := awsadapter.NewEventBridgeInventory(settings)
	route53Inventory := awsadapter.NewRoute53Inventory(settings)
	elbv2Inventory := awsadapter.NewElbv2Inventory(settings)
	kmsInventory := awsadapter.NewKmsInventory(settings)
	apigatewayInventory := awsadapter.NewApiGatewayInventory(settings)
	secretsManagerInventory := awsadapter.NewSecretsManagerInventory(settings)
	logsInventory := awsadapter.NewLogsInventory(settings)
	iamInventory := awsadapter.NewIAMInventory(settings)
	azureInventory := azureadapter.NewInventory(settings)
	dockerRuntime := dockerruntime.New(settings)
	service := app.New(settings, dataStore, discoveryService, s3Inventory, ec2Inventory, lambdaInventory, dynamodbInventory, sqsInventory, snsInventory, rdsInventory, ecsInventory, eksInventory, cloudformationInventory, eventbridgeInventory, route53Inventory, elbv2Inventory, kmsInventory, apigatewayInventory, secretsManagerInventory, logsInventory, iamInventory, azureInventory, dockerRuntime)
	server := rpc.New(service)

	if err := server.Serve(context.Background(), os.Stdin, os.Stdout); err != nil {
		log.Fatalf("rpc server stopped: %v", err)
	}
}
