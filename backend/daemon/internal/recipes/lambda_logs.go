// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"regexp"
	"strings"
)

// LambdaSourceDefinesFunction reports whether Terraform source creates a Lambda
// function that will run on AWS (and therefore needs CloudWatch Logs).
func LambdaSourceDefinesFunction(tf string) bool {
	return strings.Contains(tf, `resource "aws_lambda_function"`)
}

// LambdaSourceGrantsCloudWatchLogs reports whether every aws_lambda_function
// in tf uses a role whose attachments in the same file can write CloudWatch
// Logs. A role is granted when one of its policy attachments or inline
// policies contains AWSLambdaBasicExecutionRole, AWSLambdaVPCAccessExecutionRole,
// logs:CreateLogGroup, logs:*, or logs:PutLogEvents together with a create
// action (logs:CreateLogGroup or logs:CreateLogStream). PutLogEvents on its
// own is not enough. Logs on a different role do not count. A file with no
// Lambda function has nothing to grant and returns true.
func LambdaSourceGrantsCloudWatchLogs(tf string) bool {
	functions := terraformResources(tf, "aws_lambda_function")
	if len(functions) == 0 {
		// Nothing to grant only when the file does not declare a Lambda function.
		// A declaration the parser cannot read is not granted.
		return !LambdaSourceDefinesFunction(tf)
	}
	blocks := terraformResources(tf, "")
	for _, function := range functions {
		role := lambdaRoleName(function.body)
		if role == "" || !roleGrantsCloudWatchLogs(blocks, role) {
			return false
		}
	}
	return true
}

var lambdaRolePattern = regexp.MustCompile(`role\s*=\s*aws_iam_role\.([A-Za-z_][A-Za-z0-9_-]*)\.(?:arn|id|name)\b`)

var iamPolicyRefPattern = regexp.MustCompile(`policy_arn\s*=\s*aws_iam_policy\.([A-Za-z_][A-Za-z0-9_-]*)\.arn\b`)

func lambdaRoleName(body string) string {
	match := lambdaRolePattern.FindStringSubmatch(body)
	if len(match) < 2 {
		return ""
	}
	return match[1]
}

func roleGrantsCloudWatchLogs(blocks []tfResource, role string) bool {
	for _, block := range blocks {
		switch block.typ {
		case "aws_iam_role_policy", "aws_iam_role_policy_attachment", "aws_iam_policy_attachment":
			if lambdaRoleName(block.body) != role {
				continue
			}
			if policyBodyGrantsCloudWatchLogs(block.body) {
				return true
			}
			if policy := referencedPolicyBody(blocks, block.body); policy != "" && policyBodyGrantsCloudWatchLogs(policy) {
				return true
			}
		case "aws_iam_role":
			if block.name == role && policyBodyGrantsCloudWatchLogs(block.body) {
				return true
			}
		}
	}
	return false
}

func referencedPolicyBody(blocks []tfResource, attachment string) string {
	match := iamPolicyRefPattern.FindStringSubmatch(attachment)
	if len(match) < 2 {
		return ""
	}
	for _, block := range blocks {
		if block.typ == "aws_iam_policy" && block.name == match[1] {
			return block.body
		}
	}
	return ""
}

func policyBodyGrantsCloudWatchLogs(body string) bool {
	if strings.Contains(body, "AWSLambdaBasicExecutionRole") ||
		strings.Contains(body, "AWSLambdaVPCAccessExecutionRole") ||
		strings.Contains(body, "logs:*") ||
		strings.Contains(body, "logs:CreateLogGroup") {
		return true
	}
	return strings.Contains(body, "logs:PutLogEvents") && strings.Contains(body, "logs:CreateLogStream")
}

type tfResource struct {
	typ  string
	name string
	body string
}

// terraformResources returns resource blocks. An empty type returns every resource.
func terraformResources(src string, wantType string) []tfResource {
	var out []tfResource
	i := 0
	depth := 0
	for i < len(src) {
		next := skipTrivia(src, i)
		if next != i {
			i = next
			continue
		}
		if i >= len(src) {
			break
		}
		if src[i] == '"' {
			i = skipQuoted(src, i)
			continue
		}
		if depth == 0 && isKeyword(src, i, "resource") {
			block, after, ok := parseResource(src, i)
			if ok {
				if wantType == "" || block.typ == wantType {
					out = append(out, block)
				}
				i = after
				continue
			}
		}
		switch src[i] {
		case '{':
			depth++
		case '}':
			if depth > 0 {
				depth--
			}
		}
		i++
	}
	return out
}

func parseResource(src string, i int) (tfResource, int, bool) {
	j := skipTrivia(src, i+len("resource"))
	typ, j, ok := readQuoted(src, j)
	if !ok {
		return tfResource{}, i, false
	}
	j = skipTrivia(src, j)
	name, j, ok := readQuoted(src, j)
	if !ok {
		return tfResource{}, i, false
	}
	j = skipTrivia(src, j)
	if j >= len(src) || src[j] != '{' {
		return tfResource{}, i, false
	}
	end, ok := matchBrace(src, j)
	if !ok {
		return tfResource{}, i, false
	}
	return tfResource{typ: typ, name: name, body: src[j+1 : end]}, end + 1, true
}

func matchBrace(src string, open int) (int, bool) {
	depth := 0
	for i := open; i < len(src); {
		next := skipTrivia(src, i)
		if next != i {
			i = next
			continue
		}
		if src[i] == '"' {
			i = skipQuoted(src, i)
			continue
		}
		switch src[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i, true
			}
		}
		i++
	}
	return 0, false
}

func skipTrivia(src string, i int) int {
	for i < len(src) {
		switch {
		case src[i] == ' ' || src[i] == '\t' || src[i] == '\r' || src[i] == '\n':
			i++
		case src[i] == '#' || (src[i] == '/' && i+1 < len(src) && src[i+1] == '/'):
			for i < len(src) && src[i] != '\n' {
				i++
			}
		case src[i] == '/' && i+1 < len(src) && src[i+1] == '*':
			i += 2
			for i+1 < len(src) && !(src[i] == '*' && src[i+1] == '/') {
				i++
			}
			if i+1 < len(src) {
				i += 2
			} else {
				return len(src)
			}
		default:
			return i
		}
	}
	return i
}

func skipQuoted(src string, i int) int {
	if i >= len(src) || src[i] != '"' {
		return i
	}
	i++
	for i < len(src) {
		if src[i] == '\\' && i+1 < len(src) {
			i += 2
			continue
		}
		if src[i] == '"' {
			return i + 1
		}
		i++
	}
	return len(src)
}

func readQuoted(src string, i int) (string, int, bool) {
	if i >= len(src) || src[i] != '"' {
		return "", i, false
	}
	end := skipQuoted(src, i)
	if end <= i+1 || end > len(src) || src[end-1] != '"' {
		return "", i, false
	}
	return src[i+1 : end-1], end, true
}

func isKeyword(src string, i int, word string) bool {
	if i < 0 || i+len(word) > len(src) || src[i:i+len(word)] != word {
		return false
	}
	if i > 0 && isIdentByte(src[i-1]) {
		return false
	}
	end := i + len(word)
	if end < len(src) && isIdentByte(src[end]) {
		return false
	}
	return true
}

func isIdentByte(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_' || b == '-'
}
