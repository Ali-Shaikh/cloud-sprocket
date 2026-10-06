// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"net/url"
	"strings"
	"unicode"
)

// queueNameFromURL returns the queue name (final path segment) from an SQS URL.
func queueNameFromURL(queueURL string) string {
	_, name := sqsAccountAndName(queueURL)
	if name != "" {
		return name
	}
	return strings.TrimSpace(queueURL)
}

func sqsAccountAndName(queueURL string) (account, name string) {
	parsed, err := url.Parse(strings.TrimSpace(queueURL))
	if err != nil {
		return "", ""
	}
	segments := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(segments) == 0 || segments[0] == "" {
		return "", ""
	}
	name = segments[len(segments)-1]
	if len(segments) == 1 {
		return "", name
	}
	return segments[0], name
}

func isAWSAccountID(value string) bool {
	if len(value) != 12 {
		return false
	}
	for _, r := range value {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

// sqsQueueURLNeedsLookup reports whether the URL is missing the account id
// segment that AWS (and LocalStack) require, e.g.
// https://sqs.us-east-1.amazonaws.com/queue-name instead of
// https://sqs.us-east-1.amazonaws.com/123456789012/queue-name.
func sqsQueueURLNeedsLookup(queueURL string) bool {
	account, name := sqsAccountAndName(queueURL)
	return strings.TrimSpace(name) == "" || !isAWSAccountID(account)
}

// resolveSQSQueueURL returns queueURL unchanged when it already includes an
// account id. Incomplete URLs are resolved via lookup(queueName).
func resolveSQSQueueURL(queueURL string, lookup func(queueName string) (string, error)) (string, error) {
	queueURL = strings.TrimSpace(queueURL)
	if queueURL == "" {
		return "", nil
	}
	if !sqsQueueURLNeedsLookup(queueURL) {
		return queueURL, nil
	}
	name := queueNameFromURL(queueURL)
	if strings.TrimSpace(name) == "" || lookup == nil {
		return queueURL, nil
	}
	resolved, err := lookup(name)
	if err != nil {
		return "", err
	}
	resolved = strings.TrimSpace(resolved)
	if resolved == "" {
		return queueURL, nil
	}
	return resolved, nil
}
