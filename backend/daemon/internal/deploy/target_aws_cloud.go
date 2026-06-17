package deploy

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
)

type awsCloudTarget struct{}

func (t *awsCloudTarget) ID() string { return "aws-cloud" }

func (t *awsCloudTarget) Label(deployment *Deployment) string {
	if profile := strings.TrimSpace(deployment.ProfileID); profile != "" {
		return "AWS profile " + profile
	}
	return "AWS"
}

func (t *awsCloudTarget) Env(deployment *Deployment, settings config.Settings) []string {
	return []string{
		"AWS_PROFILE=" + deployment.ProfileID,
		"AWS_CONFIG_FILE=" + settings.AWSConfigPath,
		"AWS_SHARED_CREDENTIALS_FILE=" + settings.AWSCredentialsPath,
	}
}

func (t *awsCloudTarget) Preflight(_ context.Context, deployment *Deployment, settings config.Settings, _ TargetOptions) error {
	return checkAWSProfile(settings, deployment.ProfileID)
}

func (t *awsCloudTarget) WriteOverrides(_ string, _ *Deployment, _ TargetOptions) error {
	return nil
}

func checkAWSProfile(settings config.Settings, profileID string) error {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return fmt.Errorf("no AWS profile selected for a cloud deployment")
	}
	if profileInFile(settings.AWSCredentialsPath, profileID) || profileInFile(settings.AWSConfigPath, profileID) {
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