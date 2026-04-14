package urlinspector

import (
	"strings"
	"testing"
	"time"
)

func TestAnalyseURLParsesSigV4PresignedExpiry(t *testing.T) {
	now := time.Date(2026, 3, 25, 11, 0, 0, 0, time.UTC)
	result := AnalyseURL(
		"https://example-bucket.s3.eu-west-2.amazonaws.com/logs/app.log?X-Amz-Date=20260325T100000Z&X-Amz-Expires=7200&X-Amz-Security-Token=token",
		now,
	)

	if !strings.Contains(result.Summary, "Nominal expiry is") {
		t.Fatalf("expected expiry summary, got %q", result.Summary)
	}
	if len(result.DetailFields) < 5 {
		t.Fatalf("expected detailed inspection, got %+v", result.DetailFields)
	}
}

func TestAnalyseURLReportsNonPresignedURLs(t *testing.T) {
	result := AnalyseURL("https://example.com/download", time.Time{})

	if !strings.Contains(result.Summary, "does not expose AWS presign expiry fields") {
		t.Fatalf("expected non-presigned summary, got %q", result.Summary)
	}
}
