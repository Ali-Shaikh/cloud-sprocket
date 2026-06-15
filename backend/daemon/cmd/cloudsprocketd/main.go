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
)

func main() {
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
	azureInventory := azureadapter.NewInventory(settings)
	dockerRuntime := dockerruntime.New(settings)
	service := app.New(settings, dataStore, discoveryService, s3Inventory, ec2Inventory, lambdaInventory, dynamodbInventory, azureInventory, dockerRuntime)
	server := rpc.New(service)

	if err := server.Serve(context.Background(), os.Stdin, os.Stdout); err != nil {
		log.Fatalf("rpc server stopped: %v", err)
	}
}
