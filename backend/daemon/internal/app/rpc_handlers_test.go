// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"testing"
)

var expectedRPCMethods = []string{
	"actions.invoke",
	"app.reset",
	"app.settings.get",
	"aws.apigateway.selectApi",
	"aws.apigateway.selectRegion",
	"aws.cloudformation.selectRegion",
	"aws.cloudformation.selectStack",
	"aws.dynamodb.deleteItem",
	"aws.dynamodb.putItem",
	"aws.dynamodb.selectRegion",
	"aws.dynamodb.selectTable",
	"aws.ec2.invokeAction",
	"aws.ec2.runInstances",
	"aws.ec2.selectInstance",
	"aws.ec2.selectRegion",
	"aws.ec2.terminateInstances",
	"aws.ecs.selectCluster",
	"aws.ecs.selectRegion",
	"aws.ecs.selectService",
	"aws.ecs.selectTask",
	"aws.eks.selectCluster",
	"aws.eks.selectRegion",
	"aws.elb.selectLoadBalancer",
	"aws.elb.selectRegion",
	"aws.eventbridge.selectBus",
	"aws.eventbridge.selectRegion",
	"aws.iam.createRole",
	"aws.iam.selectRole",
	"aws.inventory.get",
	"aws.kms.selectKey",
	"aws.kms.selectRegion",
	"aws.lambda.create",
	"aws.lambda.deleteFunction",
	"aws.lambda.describe",
	"aws.lambda.invoke",
	"aws.lambda.selectFunction",
	"aws.lambda.selectRegion",
	"aws.logs.createLogGroup",
	"aws.logs.filterEvents",
	"aws.logs.putLogEvents",
	"aws.logs.selectLogGroup",
	"aws.logs.selectRegion",
	"aws.rds.selectInstance",
	"aws.rds.selectRegion",
	"aws.rds.startInstance",
	"aws.rds.stopInstance",
	"aws.route53.selectHostedZone",
	"aws.s3.analyseUrl",
	"aws.s3.copyObject",
	"aws.s3.createBucket",
	"aws.s3.createFolderPrefix",
	"aws.s3.deleteObject",
	"aws.s3.loadMoreObjects",
	"aws.s3.presignObject",
	"aws.s3.selectBucket",
	"aws.s3.selectObject",
	"aws.s3.setPrefixFilter",
	"aws.s3.uploadObject",
	"aws.s3.validateUrl",
	"aws.secrets.reveal",
	"aws.secrets.selectRegion",
	"aws.secrets.selectSecret",
	"aws.sns.createTopic",
	"aws.sns.publish",
	"aws.sns.selectRegion",
	"aws.sns.selectTopic",
	"aws.sqs.createQueue",
	"aws.sqs.peek",
	"aws.sqs.selectQueue",
	"aws.sqs.selectRegion",
	"aws.sqs.sendMessage",
	"azure.bastion.connect",
	"azure.bastion.list",
	"azure.cosmos.selectAccount",
	"azure.cosmos.selectContainer",
	"azure.cosmos.selectDatabase",
	"azure.frontDoor.purgeCache",
	"azure.frontDoor.refresh",
	"azure.frontDoor.selectEndpoint",
	"azure.frontDoor.selectOriginGroup",
	"azure.frontDoor.selectProfile",
	"azure.functions.invoke",
	"azure.functions.selectApp",
	"azure.functions.selectFunction",
	"azure.inventory.get",
	"azure.keyVault.revealSecret",
	"azure.keyVault.selectSecret",
	"azure.keyVault.selectVault",
	"azure.keyVault.setSecret",
	"azure.logAnalytics.history.list",
	"azure.logAnalytics.query",
	"azure.logAnalytics.saved.delete",
	"azure.logAnalytics.saved.list",
	"azure.logAnalytics.saved.save",
	"azure.logAnalytics.selectWorkspace",
	"azure.logAnalytics.table.schema",
	"azure.logAnalytics.tables.list",
	"azure.postgres.selectServer",
	"azure.postgres.startServer",
	"azure.postgres.stopServer",
	"azure.queues.selectQueue",
	"azure.resourceGroups.create",
	"azure.resourceGroups.delete",
	"azure.selectResourceGroup",
	"azure.selectVirtualMachine",
	"azure.storage.copyBlob",
	"azure.storage.createAccount",
	"azure.storage.createContainer",
	"azure.storage.createFolderPrefix",
	"azure.storage.deleteBlob",
	"azure.storage.presignBlob",
	"azure.storage.selectAccount",
	"azure.storage.selectBlob",
	"azure.storage.selectContainer",
	"azure.storage.setPrefixFilter",
	"azure.storage.uploadBlob",
	"azure.virtualMachines.invokeAction",
	"azure.waf.config.addExclusion",
	"azure.waf.config.removeExclusion",
	"azure.waf.config.setManagedRule",
	"azure.waf.config.setMode",
	"azure.waf.logs.schema",
	"azure.waf.refresh",
	"azure.waf.selectPolicy",
	"azure.webApps.create",
	"azure.webApps.createSlot",
	"azure.webApps.deleteSetting",
	"azure.webApps.invokeAction",
	"azure.webApps.select",
	"azure.webApps.selectSlot",
	"azure.webApps.setSetting",
	"azure.webApps.swapSlots",
	"deployments.apply",
	"deployments.cancel",
	"deployments.checkDrift",
	"deployments.delete",
	"deployments.destroy",
	"deployments.get",
	"deployments.list",
	"deployments.plan",
	"deployments.retryPostApply",
	"docker.resources.list",
	"docker.runtime.get",
	"emulators.list",
	"emulators.logs",
	"emulators.prepareProfile",
	"emulators.start",
	"emulators.stop",
	"gcp.storage.loadMoreObjects",
	"gcp.storage.selectBucket",
	"gcp.storage.setPrefixFilter",
	"labs.get",
	"labs.reset",
	"labs.runAction",
	"labs.start",
	"labs.verifyStep",
	"logs.list",
	"preferences.get",
	"preferences.hiddenResources.get",
	"preferences.update",
	"profiles.list",
	"providers.list",
	"recipes.get",
	"recipes.import",
	"recipes.list",
	"recipes.scaffold",
	"recipes.validate",
	"runtime.get",
	"session.get",
	"session.lock",
	"session.selectAuthMethod",
	"session.selectProfile",
	"session.selectProvider",
	"session.setWriteMode",
	"session.unlock",
	"tofu.install",
	"tofu.status",
	"workspace.get",
}

func TestMethodRegistryHasExpectedSurface(t *testing.T) {
	t.Parallel()
	if !slices.IsSorted(expectedRPCMethods) {
		t.Fatal("expectedRPCMethods must remain sorted")
	}

	got := (&Service{}).RegisteredMethods()
	if !slices.Equal(got, expectedRPCMethods) {
		t.Fatalf("registered methods changed:\n got: %q\nwant: %q", got, expectedRPCMethods)
	}
}

func TestHandlerRegistryRejectsDuplicate(t *testing.T) {
	t.Parallel()

	registry := newHandlerRegistry(1)
	handler := RPCHandler(func(context.Context, json.RawMessage, Notifier) (any, error) {
		return nil, nil
	})
	registry.register("duplicate.method", handler)

	defer func() {
		recovered := recover()
		if recovered == nil {
			t.Fatal("duplicate RPC method registration did not panic")
		}
		message, ok := recovered.(string)
		if !ok || message != "duplicate RPC method registration: duplicate.method" {
			t.Fatalf("unexpected duplicate registration panic: %#v", recovered)
		}
	}()
	registry.register("duplicate.method", handler)
}

func TestMethodRegistryBuildUsesDuplicateGuard(t *testing.T) {
	t.Parallel()

	registry := newHandlerRegistry(len(expectedRPCMethods))
	(&Service{}).registerMethodHandlers(registry)
	if got := len(registry.handlers); got != len(expectedRPCMethods) {
		t.Fatalf("registered methods: got %d, want %d", got, len(expectedRPCMethods))
	}
}

func TestHandleUnknownMethod(t *testing.T) {
	t.Parallel()
	service := &Service{}
	_, err := service.Handle(context.Background(), "does.not.exist", nil, nil)
	if err == nil {
		t.Fatal("expected method-not-found error")
	}
	var public PublicError
	if !errors.As(err, &public) {
		t.Fatalf("expected PublicError, got %T: %v", err, err)
	}
	if public.StableCode() != "method_not_found" {
		t.Fatalf("stable code: got %q, want method_not_found", public.StableCode())
	}
}

func TestMethodHandlersMemoised(t *testing.T) {
	t.Parallel()
	service := &Service{}
	a := service.methodHandlers()
	b := service.methodHandlers()
	if len(a) != len(b) {
		t.Fatalf("handler map size changed between calls: %d vs %d", len(a), len(b))
	}
	if _, ok := a["providers.list"]; !ok {
		t.Fatal("providers.list missing")
	}
	// sync.Once must return the same map instance: mutate through one reference.
	sentinel := RPCHandler(func(context.Context, json.RawMessage, Notifier) (any, error) {
		return "memo-test", nil
	})
	a["__memo_identity_probe__"] = sentinel
	got, ok := b["__memo_identity_probe__"]
	if !ok {
		t.Fatal("methodHandlers returned a different map on second call")
	}
	delete(a, "__memo_identity_probe__")
	if _, still := b["__memo_identity_probe__"]; still {
		t.Fatal("probe key still present after delete on shared map")
	}
	_ = got
}
