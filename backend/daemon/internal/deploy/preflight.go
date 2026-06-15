package deploy

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// preflightTimeout bounds the reachability probe so a dead target fails fast
// with a clear message instead of stalling behind tofu's own minutes-long
// retry loop (the "Still creating..." spin a user sees against a down emulator).
const preflightTimeout = 3 * time.Second

// Preflight verifies the deployment target is reachable (local emulator) or
// configured (cloud profile) before any tofu command runs. It exists because
// tofu, pointed at an unreachable endpoint, retries silently for a long time;
// catching it here turns that into an immediate, actionable error.
func (e *Engine) Preflight(ctx context.Context, deployment *Deployment) error {
	if deployment.ProviderID == "aws" {
		if deployment.Local {
			return e.checkLocalStack(ctx)
		}
		return e.checkAWSProfile(deployment.ProfileID)
	}
	return nil
}

// checkLocalStack confirms the LocalStack health endpoint answers, so a
// deployment against a stopped emulator fails immediately.
func (e *Engine) checkLocalStack(ctx context.Context) error {
	base := strings.TrimRight(e.localStackEndpoint, "/")
	probeCtx, cancel := context.WithTimeout(ctx, preflightTimeout)
	defer cancel()

	request, err := http.NewRequestWithContext(probeCtx, http.MethodGet, base+"/_localstack/health", nil)
	if err != nil {
		return err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return fmt.Errorf("LocalStack is not reachable at %s. Start it from Local Runtime, then try again", e.localStackEndpoint)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("LocalStack at %s is not ready (HTTP %d). Wait for it to finish starting, then try again", e.localStackEndpoint, response.StatusCode)
	}
	return nil
}

// checkAWSProfile confirms the selected profile is present in the user's AWS
// credentials/config files. Live credential validity is left to tofu, which
// reports it quickly; this catches the common "wrong/missing profile" case
// before a workspace is even prepared.
func (e *Engine) checkAWSProfile(profileID string) error {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return fmt.Errorf("no AWS profile selected for a cloud deployment")
	}
	if profileInFile(e.settings.AWSCredentialsPath, profileID) || profileInFile(e.settings.AWSConfigPath, profileID) {
		return nil
	}
	return fmt.Errorf("AWS profile %q is not configured in your AWS credentials or config files. Add it, or pick a different target, before deploying", profileID)
}

// profileInFile reports whether an AWS shared-config file defines the named
// profile. Credentials files use a bare "[name]" header; config files use the
// "[profile name]" form, so both spellings are accepted.
func profileInFile(path, profileID string) bool {
	path = strings.TrimSpace(path)
	if path == "" {
		return false
	}
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	bare := "[" + profileID + "]"
	prefixed := "[profile " + profileID + "]"
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == bare || line == prefixed {
			return true
		}
	}
	return false
}
