package urlinspector

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

type Inspection struct {
	Summary      string               `json:"summary"`
	DetailFields []models.DetailField `json:"detailFields"`
}

type ValidationResult struct {
	URL          string               `json:"url"`
	Succeeded    bool                 `json:"succeeded"`
	Summary      string               `json:"summary"`
	DetailFields []models.DetailField `json:"detailFields"`
}

func AnalyseURL(raw string, now time.Time) Inspection {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return Inspection{Summary: "Paste a URL to inspect it."}
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return Inspection{Summary: "Enter a valid URL to inspect it."}
	}

	if now.IsZero() {
		now = time.Now().UTC()
	}

	fields := []models.DetailField{
		{Label: "Host", Value: parsed.Host},
		{Label: "Checked At", Value: formatTime(now)},
	}
	query := parsed.Query()

	if query.Has("X-Amz-Date") && query.Has("X-Amz-Expires") {
		signedAt, err := time.Parse("20060102T150405Z", query.Get("X-Amz-Date"))
		if err != nil {
			fields = append(fields, models.DetailField{Label: "Signature Type", Value: "AWS SigV4 query signature"})
			return Inspection{
				Summary:      "This URL looks AWS-signed, but its expiry parameters could not be parsed.",
				DetailFields: fields,
			}
		}
		expiresIn, err := strconv.Atoi(query.Get("X-Amz-Expires"))
		if err != nil {
			fields = append(fields, models.DetailField{Label: "Signature Type", Value: "AWS SigV4 query signature"})
			return Inspection{
				Summary:      "This URL looks AWS-signed, but its expiry parameters could not be parsed.",
				DetailFields: fields,
			}
		}
		expiresAt := signedAt.UTC().Add(time.Duration(expiresIn) * time.Second)
		fields = append(fields,
			models.DetailField{Label: "Signature Type", Value: "AWS SigV4 presigned URL"},
			models.DetailField{Label: "Signed At", Value: formatTime(signedAt.UTC())},
			models.DetailField{Label: "Requested Duration", Value: formatDuration(expiresIn)},
			models.DetailField{Label: "Nominal Expiry", Value: formatTime(expiresAt)},
			models.DetailField{Label: "Time Remaining", Value: formatRemaining(expiresAt.Sub(now.UTC()))},
		)
		if query.Has("X-Amz-Security-Token") {
			fields = append(fields, models.DetailField{
				Label: "Temporary Credentials",
				Value: "Present. Effective expiry may be earlier than the requested duration.",
			})
		}
		summary := fmt.Sprintf("Nominal expiry is %s.", formatTime(expiresAt))
		if expiresAt.Before(now.UTC()) {
			summary = fmt.Sprintf("This URL appears expired since %s.", formatTime(expiresAt))
		}
		return Inspection{Summary: summary, DetailFields: fields}
	}

	if query.Has("Expires") {
		seconds, err := strconv.ParseInt(query.Get("Expires"), 10, 64)
		if err != nil {
			return Inspection{
				Summary:      "This URL exposes an Expires value, but it could not be parsed.",
				DetailFields: fields,
			}
		}
		expiresAt := time.Unix(seconds, 0).UTC()
		fields = append(fields,
			models.DetailField{Label: "Signature Type", Value: "Expiry parameter detected"},
			models.DetailField{Label: "Nominal Expiry", Value: formatTime(expiresAt)},
			models.DetailField{Label: "Time Remaining", Value: formatRemaining(expiresAt.Sub(now.UTC()))},
		)
		summary := fmt.Sprintf("Nominal expiry is %s.", formatTime(expiresAt))
		if expiresAt.Before(now.UTC()) {
			summary = fmt.Sprintf("This URL appears expired since %s.", formatTime(expiresAt))
		}
		return Inspection{Summary: summary, DetailFields: fields}
	}

	fields = append(fields, models.DetailField{
		Label: "Signature Type",
		Value: "No AWS presign expiry fields detected",
	})
	return Inspection{
		Summary:      "This URL does not expose AWS presign expiry fields. Live validation is still available.",
		DetailFields: fields,
	}
}

func ValidateURL(client *http.Client, raw string) ValidationResult {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	request, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		return ValidationResult{
			URL:       raw,
			Succeeded: false,
			Summary:   "Live validation could not create the request.",
		}
	}
	request.Header.Set("Range", "bytes=0-0")
	request.Header.Set("User-Agent", "CloudSprocket/2.0")

	response, err := client.Do(request)
	if err != nil {
		return ValidationResult{
			URL:       raw,
			Succeeded: false,
			Summary:   fmt.Sprintf("Live validation could not reach the server: %v", err),
			DetailFields: []models.DetailField{
				{Label: "Checked At", Value: formatTime(time.Now().UTC())},
			},
		}
	}
	defer response.Body.Close()

	fields := []models.DetailField{
		{Label: "Checked At", Value: formatTime(time.Now().UTC())},
		{Label: "HTTP Status", Value: fmt.Sprintf("%d %s", response.StatusCode, response.Status)},
	}
	if contentType := response.Header.Get("Content-Type"); contentType != "" {
		fields = append(fields, models.DetailField{Label: "Content Type", Value: contentType})
	}
	if contentLength := response.Header.Get("Content-Length"); contentLength != "" {
		fields = append(fields, models.DetailField{Label: "Content Length", Value: contentLength})
	}

	return ValidationResult{
		URL:          raw,
		Succeeded:    response.StatusCode >= 200 && response.StatusCode < 400,
		Summary:      fmt.Sprintf("Live validation succeeded with HTTP %d.", response.StatusCode),
		DetailFields: fields,
	}
}

func formatTime(value time.Time) string {
	return value.UTC().Format("2006-01-02 15:04 UTC")
}

func formatDuration(totalSeconds int) string {
	if totalSeconds%86400 == 0 {
		days := totalSeconds / 86400
		if days == 1 {
			return "1 day"
		}
		return fmt.Sprintf("%d days", days)
	}
	if totalSeconds%3600 == 0 {
		hours := totalSeconds / 3600
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}
	if totalSeconds >= 60 {
		minutes := totalSeconds / 60
		if minutes == 1 {
			return "1 minute"
		}
		return fmt.Sprintf("%d minutes", minutes)
	}
	return fmt.Sprintf("%d seconds", totalSeconds)
}

func formatRemaining(delta time.Duration) string {
	totalSeconds := int(delta.Seconds())
	if totalSeconds < 0 {
		return fmt.Sprintf("Expired %s ago", formatDuration(-totalSeconds))
	}
	return fmt.Sprintf("%s remaining", formatDuration(totalSeconds))
}
