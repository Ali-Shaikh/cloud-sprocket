package deploy

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/sysproc"
	"cloudsprocket/backend/daemon/internal/tofu"
)

// runImagePipeline builds a container image from a Dockerfile directory and sets
// the recipe's image variable. Skipped when the Dockerfile dir is empty or has
// no Dockerfile. Local deployments use a local tag; cloud deployments push to ECR.
func (e *Engine) runImagePipeline(
	ctx context.Context,
	deployment *Deployment,
	spec *recipes.ImageBuildSpec,
	onLine tofu.LogFunc,
) error {
	if spec == nil || strings.TrimSpace(spec.DockerfileDirVar) == "" || strings.TrimSpace(spec.ImageVar) == "" {
		return nil
	}

	dir := variablePath(deployment, spec.DockerfileDirVar, e.WorkspaceDir(deployment.ID))
	if dir == "" {
		return nil
	}
	dockerfile := filepath.Join(dir, "Dockerfile")
	if _, err := os.Stat(dockerfile); err != nil {
		if onLine != nil {
			onLine(fmt.Sprintf("Skipping image build: no Dockerfile in %s", dir))
		}
		return nil
	}

	repoName := imageRepositoryName(deployment, spec)
	localTag := fmt.Sprintf("%s:latest", repoName)

	if onLine != nil {
		onLine(fmt.Sprintf("> Building container image %s from %s", localTag, dir))
	}
	if err := runDockerBuild(ctx, dir, localTag, onLine); err != nil {
		return err
	}

	var imageRef string
	if deployment.Local {
		imageRef = localTag
		if onLine != nil {
			onLine(fmt.Sprintf("Using local image tag %s for the emulator target", imageRef))
		}
	} else {
		region := stringVariable(deployment.Variables, "aws_region", "us-east-1")
		uri, err := e.pushImageToECR(ctx, deployment, region, repoName, localTag, onLine)
		if err != nil {
			return err
		}
		imageRef = uri
	}

	if deployment.Variables == nil {
		deployment.Variables = map[string]any{}
	}
	deployment.Variables[spec.ImageVar] = imageRef
	return writeTfvars(e.WorkspaceDir(deployment.ID), deployment.Variables)
}

func variablePath(deployment *Deployment, varName, workspace string) string {
	if deployment.Variables == nil {
		return ""
	}
	value, ok := deployment.Variables[varName]
	if !ok {
		return ""
	}
	dir := strings.TrimSpace(fmt.Sprint(value))
	if dir == "" {
		return ""
	}
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(workspace, dir)
	}
	return dir
}

func stringVariable(variables map[string]any, name, fallback string) string {
	if variables == nil {
		return fallback
	}
	value, ok := variables[name]
	if !ok {
		return fallback
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "" {
		return fallback
	}
	return text
}

func imageRepositoryName(deployment *Deployment, spec *recipes.ImageBuildSpec) string {
	if spec.RepositoryVar != "" {
		if name := stringVariable(deployment.Variables, spec.RepositoryVar, ""); name != "" {
			return sanitiseECRRepoName(name)
		}
	}
	app := stringVariable(deployment.Variables, "app_name", "myapp")
	env := stringVariable(deployment.Variables, "environment", "dev")
	return sanitiseECRRepoName(fmt.Sprintf("%s-%s-api", app, env))
}

func sanitiseECRRepoName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '/' || r == '.':
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "cloudsprocket-app"
	}
	return out
}

func runDockerBuild(ctx context.Context, dir, tag string, onLine tofu.LogFunc) error {
	cmd := exec.CommandContext(ctx, "docker", "build", "-t", tag, dir)
	sysproc.Hide(cmd)
	writer := &buildLineWriter{onLine: onLine}
	cmd.Stdout = writer
	cmd.Stderr = writer
	err := cmd.Run()
	writer.flush()
	if err != nil {
		return fmt.Errorf("docker build failed: %w", err)
	}
	return nil
}

func (e *Engine) pushImageToECR(
	ctx context.Context,
	deployment *Deployment,
	region, repoName, localTag string,
	onLine tofu.LogFunc,
) (string, error) {
	accountID, err := awsCallerAccount(ctx, e.env(deployment))
	if err != nil {
		return "", err
	}
	repoURI := fmt.Sprintf("%s.dkr.ecr.%s.amazonaws.com/%s", accountID, region, repoName)

	if onLine != nil {
		onLine(fmt.Sprintf("> Ensuring ECR repository %s exists", repoName))
	}
	if err := ensureECRRepository(ctx, e.env(deployment), region, repoName, onLine); err != nil {
		return "", err
	}

	if onLine != nil {
		onLine(fmt.Sprintf("> Logging Docker into %s", repoURI))
	}
	if err := dockerECRLogin(ctx, region, accountID, e.env(deployment), onLine); err != nil {
		return "", err
	}

	remoteTag := repoURI + ":latest"
	if onLine != nil {
		onLine(fmt.Sprintf("> Pushing %s", remoteTag))
	}
	if err := runDockerTagAndPush(ctx, localTag, remoteTag, onLine); err != nil {
		return "", err
	}
	return remoteTag, nil
}

func awsCallerAccount(ctx context.Context, env []string) (string, error) {
	cmd := exec.CommandContext(ctx, "aws", "sts", "get-caller-identity", "--output", "json")
	cmd.Env = append(os.Environ(), env...)
	sysproc.Hide(cmd)
	raw, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("aws sts get-caller-identity: %w", err)
	}
	var decoded struct {
		Account string `json:"Account"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return "", fmt.Errorf("parse caller identity: %w", err)
	}
	if strings.TrimSpace(decoded.Account) == "" {
		return "", fmt.Errorf("aws sts get-caller-identity returned an empty account id")
	}
	return decoded.Account, nil
}

func ensureECRRepository(ctx context.Context, env []string, region, repoName string, onLine tofu.LogFunc) error {
	describe := exec.CommandContext(ctx, "aws", "ecr", "describe-repositories",
		"--repository-names", repoName,
		"--region", region,
		"--output", "json",
	)
	describe.Env = append(os.Environ(), env...)
	sysproc.Hide(describe)
	if err := describe.Run(); err == nil {
		return nil
	}
	create := exec.CommandContext(ctx, "aws", "ecr", "create-repository",
		"--repository-name", repoName,
		"--region", region,
		"--output", "json",
	)
	create.Env = append(os.Environ(), env...)
	sysproc.Hide(create)
	writer := &buildLineWriter{onLine: onLine}
	create.Stdout = writer
	create.Stderr = writer
	err := create.Run()
	writer.flush()
	if err != nil {
		return fmt.Errorf("aws ecr create-repository: %w", err)
	}
	return nil
}

func dockerECRLogin(ctx context.Context, region, accountID string, env []string, onLine tofu.LogFunc) error {
	endpoint := fmt.Sprintf("%s.dkr.ecr.%s.amazonaws.com", accountID, region)

	password := exec.CommandContext(ctx, "aws", "ecr", "get-login-password", "--region", region)
	password.Env = append(os.Environ(), env...)
	sysproc.Hide(password)
	passRaw, err := password.Output()
	if err != nil {
		return fmt.Errorf("aws ecr get-login-password: %w", err)
	}

	login := exec.CommandContext(ctx, "docker", "login", "--username", "AWS", "--password-stdin", endpoint)
	login.Env = os.Environ()
	sysproc.Hide(login)
	login.Stdin = strings.NewReader(strings.TrimSpace(string(passRaw)))
	writer := &buildLineWriter{onLine: onLine}
	login.Stdout = writer
	login.Stderr = writer
	err = login.Run()
	writer.flush()
	if err != nil {
		return fmt.Errorf("docker login to %s: %w", endpoint, err)
	}
	return nil
}

func runDockerTagAndPush(ctx context.Context, localTag, remoteTag string, onLine tofu.LogFunc) error {
	tag := exec.CommandContext(ctx, "docker", "tag", localTag, remoteTag)
	sysproc.Hide(tag)
	if err := tag.Run(); err != nil {
		return fmt.Errorf("docker tag: %w", err)
	}
	push := exec.CommandContext(ctx, "docker", "push", remoteTag)
	sysproc.Hide(push)
	writer := &buildLineWriter{onLine: onLine}
	push.Stdout = writer
	push.Stderr = writer
	err := push.Run()
	writer.flush()
	if err != nil {
		return fmt.Errorf("docker push: %w", err)
	}
	return nil
}