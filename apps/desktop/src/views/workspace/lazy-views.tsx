// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { lazy } from "react";

export const StorageView = lazy(() => import("./StorageView"));
export const ComputeView = lazy(() => import("./ComputeView"));
export const DynamoDBView = lazy(() => import("./DynamoDBView"));
export const SQSView = lazy(() => import("./SQSView"));
export const SNSView = lazy(() => import("./SNSView"));
export const RDSView = lazy(() => import("./RDSView"));
export const ECSView = lazy(() => import("./ECSView"));
export const ApiGatewayView = lazy(() => import("./ApiGatewayView"));
export const LogsView = lazy(() => import("./LogsView"));
export const IAMView = lazy(() => import("./IAMView"));
export const LambdaView = lazy(() => import("./LambdaView"));
export const AzureView = lazy(() => import("./AzureView"));
export const AzureStorageView = lazy(() => import("./AzureStorageView"));
export const AzureAppServiceView = lazy(() => import("./AzureAppServiceView"));
export const LogAnalyticsView = lazy(() => import("./LogAnalyticsView"));
export const ToolsHubView = lazy(() => import("./ToolsHubView"));
export const AzureWafView = lazy(() => import("./AzureWafView"));
export const AzureFrontDoorView = lazy(() => import("./AzureFrontDoorView"));
export const AzureFunctionsView = lazy(() => import("./AzureFunctionsView"));
export const AzureKeyVaultView = lazy(() => import("./AzureKeyVaultView"));
export const AzureCosmosView = lazy(() => import("./AzureCosmosView"));
export const AzurePostgresView = lazy(() => import("./AzurePostgresView"));
export const AzureQueuesView = lazy(() => import("./AzureQueuesView"));
export const AzureEntraView = lazy(() => import("./AzureEntraView"));
export const RuntimeView = lazy(() => import("./RuntimeView"));
export const PlaceholderView = lazy(() => import("./PlaceholderView"));
export const ActivityView = lazy(() => import("./ActivityView"));