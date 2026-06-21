//go:build !windows

package sysproc

import "strings"

// BuildWindowsCmdLine is unused off Windows but keeps call sites portable in tests.
func BuildWindowsCmdLine(command string, args ...string) string {
	return buildUnixShellLine(command, args...)
}

// BuildWindowsPowerShellLine is unused off Windows.
func BuildWindowsPowerShellLine(command string, args ...string) string {
	return buildUnixShellLine(command, args...)
}

// QuoteWindowsArg is unused off Windows.
func QuoteWindowsArg(value string) string {
	return quoteUnixToken(value)
}

func buildUnixShellLine(command string, args ...string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, quoteUnixToken(command))
	for _, arg := range args {
		parts = append(parts, quoteUnixToken(arg))
	}
	return strings.Join(parts, " ")
}

func quoteUnixToken(value string) string {
	if value == "" {
		return "''"
	}
	if !strings.ContainsAny(value, " \t\"'$\\") {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}