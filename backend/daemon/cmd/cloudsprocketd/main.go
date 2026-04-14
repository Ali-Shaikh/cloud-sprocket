package main

import (
	"context"
	"log"
	"os/exec"
	"os"

	"cloudsprocket/backend/daemon/internal/app"
	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
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
	service := app.New(settings, dataStore, discoveryService)
	server := rpc.New(service)

	if err := server.Serve(context.Background(), os.Stdin, os.Stdout); err != nil {
		log.Fatalf("rpc server stopped: %v", err)
	}
}
