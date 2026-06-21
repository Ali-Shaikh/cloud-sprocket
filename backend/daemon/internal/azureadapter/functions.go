package azureadapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

const functionInvokeTimeout = 30 * time.Second

// ListFunctionApps returns the Function Apps (Microsoft.Web/sites, kind functionapp)
// visible to the profile. floci-az serves these over ARM locally; cloud uses the az CLI.
func (i *Inventory) ListFunctionApps(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureFunctionApp, error) {
	if isLocalFlociProfile(profile) {
		return i.listLocalFunctionApps(ctx)
	}
	args := []string{
		"functionapp", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name            string `json:"name"`
		ResourceGroup   string `json:"resourceGroup"`
		Location        string `json:"location"`
		State           string `json:"state"`
		DefaultHostName string `json:"defaultHostName"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode azure function apps: %w", err)
	}
	apps := make([]models.AzureFunctionApp, 0, len(decoded))
	for _, item := range decoded {
		apps = append(apps, models.AzureFunctionApp{
			Name:            item.Name,
			ResourceGroup:   item.ResourceGroup,
			Location:        item.Location,
			State:           item.State,
			DefaultHostName: item.DefaultHostName,
		})
	}
	sortFunctionApps(apps)
	return apps, nil
}

func (i *Inventory) listLocalFunctionApps(ctx context.Context) ([]models.AzureFunctionApp, error) {
	url := fmt.Sprintf("%s/subscriptions/%s/providers/Microsoft.Web/sites?api-version=2022-03-01",
		i.flociBaseURL(), i.localSubscriptionID)
	var decoded struct {
		Value []struct {
			Name       string `json:"name"`
			Location   string `json:"location"`
			Kind       string `json:"kind"`
			Properties struct {
				State           string `json:"state"`
				DefaultHostName string `json:"defaultHostName"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := i.flociJSON(ctx, http.MethodGet, url, nil, &decoded); err != nil {
		return nil, err
	}
	apps := make([]models.AzureFunctionApp, 0, len(decoded.Value))
	for _, item := range decoded.Value {
		if item.Kind != "" && !strings.Contains(strings.ToLower(item.Kind), "functionapp") {
			continue
		}
		apps = append(apps, models.AzureFunctionApp{
			Name:            item.Name,
			Location:        item.Location,
			State:           item.Properties.State,
			DefaultHostName: item.Properties.DefaultHostName,
		})
	}
	sortFunctionApps(apps)
	return apps, nil
}

func sortFunctionApps(apps []models.AzureFunctionApp) {
	sort.Slice(apps, func(left, right int) bool {
		return strings.ToLower(apps[left].Name) < strings.ToLower(apps[right].Name)
	})
}

// ListFunctions returns the functions within a Function App.
func (i *Inventory) ListFunctions(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
) ([]models.AzureFunction, error) {
	appName = strings.TrimSpace(appName)
	if appName == "" {
		return nil, fmt.Errorf("a function app is required")
	}
	if isLocalFlociProfile(profile) {
		return i.listLocalFunctions(ctx, appName)
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	if resourceGroup == "" {
		return nil, fmt.Errorf("a resource group is required")
	}
	args := []string{
		"functionapp", "function", "list",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	return decodeFunctions(payload), nil
}

func (i *Inventory) listLocalFunctions(ctx context.Context, appName string) ([]models.AzureFunction, error) {
	url := fmt.Sprintf("%s/admin/apps/%s/functions", i.flociBaseURL(), appName)
	payload, err := i.flociRaw(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return decodeFunctions(payload), nil
}

// decodeFunctions parses both the az CLI and floci function-list shapes leniently:
// an array of objects with a name and binding metadata.
func decodeFunctions(payload []byte) []models.AzureFunction {
	var decoded []struct {
		Name   string `json:"name"`
		Config struct {
			Bindings []struct {
				Type      string `json:"type"`
				Direction string `json:"direction"`
			} `json:"bindings"`
		} `json:"config"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return []models.AzureFunction{}
	}
	functions := make([]models.AzureFunction, 0, len(decoded))
	for _, item := range decoded {
		name := item.Name
		if idx := strings.LastIndex(name, "/"); idx >= 0 {
			name = name[idx+1:]
		}
		if name == "" {
			continue
		}
		trigger := ""
		for _, binding := range item.Config.Bindings {
			if strings.HasSuffix(strings.ToLower(binding.Type), "trigger") {
				trigger = binding.Type
				break
			}
		}
		functions = append(functions, models.AzureFunction{Name: name, Trigger: trigger})
	}
	sort.Slice(functions, func(left, right int) bool {
		return strings.ToLower(functions[left].Name) < strings.ToLower(functions[right].Name)
	})
	return functions
}

// InvokeFunction invokes an HTTP-triggered function with a test payload.
func (i *Inventory) InvokeFunction(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	functionName string,
	payload string,
) (models.AzureFunctionInvokeResult, error) {
	appName = strings.TrimSpace(appName)
	functionName = strings.TrimSpace(functionName)
	if appName == "" || functionName == "" {
		return models.AzureFunctionInvokeResult{}, fmt.Errorf("a function app and function are required")
	}
	ctx, cancel := context.WithTimeout(ctx, functionInvokeTimeout)
	defer cancel()

	var url string
	if isLocalFlociProfile(profile) {
		url = fmt.Sprintf("%s/api/%s/%s", i.flociBaseURL(), appName, functionName)
	} else {
		host, key, err := i.cloudFunctionInvokeTarget(ctx, profile, resourceGroup, appName, functionName)
		if err != nil {
			return models.AzureFunctionInvokeResult{}, err
		}
		url = fmt.Sprintf("https://%s/api/%s", host, functionName)
		if key != "" {
			url += "?code=" + key
		}
	}
	status, body, err := i.httpPost(ctx, url, payload)
	if err != nil {
		return models.AzureFunctionInvokeResult{}, err
	}
	return models.AzureFunctionInvokeResult{StatusCode: status, Body: truncateBody(body)}, nil
}

// cloudFunctionInvokeTarget resolves the function host + a usable key on real Azure.
func (i *Inventory) cloudFunctionInvokeTarget(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
	functionName string,
) (string, string, error) {
	resourceGroup = strings.TrimSpace(resourceGroup)
	if resourceGroup == "" {
		return "", "", fmt.Errorf("a resource group is required to invoke a cloud function")
	}
	showPayload, err := i.run(ctx,
		"functionapp", "show",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return "", "", err
	}
	var show struct {
		DefaultHostName string `json:"defaultHostName"`
	}
	if err := json.Unmarshal(showPayload, &show); err != nil {
		return "", "", fmt.Errorf("decode function app: %w", err)
	}
	if show.DefaultHostName == "" {
		return "", "", fmt.Errorf("function app %s has no default hostname", appName)
	}
	keysPayload, err := i.run(ctx,
		"functionapp", "keys", "list",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--name", appName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return show.DefaultHostName, "", nil
	}
	var keys struct {
		FunctionKeys struct {
			Default string `json:"default"`
		} `json:"functionKeys"`
		MasterKey string `json:"masterKey"`
	}
	_ = json.Unmarshal(keysPayload, &keys)
	key := keys.FunctionKeys.Default
	if key == "" {
		key = keys.MasterKey
	}
	return show.DefaultHostName, key, nil
}

func truncateBody(body string) string {
	const max = 8192
	if len(body) > max {
		return body[:max] + "… (truncated)"
	}
	return body
}

// flociRaw performs a request against floci-az and returns the raw body.
func (i *Inventory) flociRaw(ctx context.Context, method, url string, body io.Reader) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer floci-local")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("floci-az request: %w", err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("floci-az %s %s returned HTTP %d", method, url, response.StatusCode)
	}
	return raw, nil
}

// httpPost sends a payload and returns the status code and response body.
func (i *Inventory) httpPost(ctx context.Context, url, payload string) (int, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte(payload)))
	if err != nil {
		return 0, "", err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, "", fmt.Errorf("invoke function: %w", err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	return response.StatusCode, string(raw), nil
}
