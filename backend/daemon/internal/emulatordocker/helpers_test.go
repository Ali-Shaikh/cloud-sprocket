// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package emulatordocker

import (
	"bytes"
	"encoding/binary"
	"io"
	"reflect"
	"testing"
)

func TestClampLogTail(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   int
		want int
	}{
		{0, 200},
		{-1, 200},
		{1, 1},
		{200, 200},
		{1000, 1000},
		{1001, 1000},
	}
	for _, tc := range cases {
		if got := ClampLogTail(tc.in); got != tc.want {
			t.Fatalf("ClampLogTail(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestValidEnvName(t *testing.T) {
	t.Parallel()
	valid := []string{"FOO", "foo_bar", "_PRIVATE", "A1", "x9_Y"}
	for _, name := range valid {
		if !ValidEnvName(name) {
			t.Fatalf("ValidEnvName(%q) = false, want true", name)
		}
	}
	invalid := []string{"", "1ABC", "FOO-BAR", "FOO.BAR", "FOO BAR", "FOO=BAR"}
	for _, name := range invalid {
		if ValidEnvName(name) {
			t.Fatalf("ValidEnvName(%q) = true, want false", name)
		}
	}
}

func TestTruncateID(t *testing.T) {
	t.Parallel()
	if got := TruncateID("abcdefghijklmno"); got != "abcdefghijkl" {
		t.Fatalf("TruncateID long = %q", got)
	}
	if got := TruncateID("short"); got != "short" {
		t.Fatalf("TruncateID short = %q", got)
	}
	if got := TruncateID(""); got != "" {
		t.Fatalf("TruncateID empty = %q", got)
	}
}

func TestSplitLogLines(t *testing.T) {
	t.Parallel()
	if got := SplitLogLines(""); !reflect.DeepEqual(got, []string{}) {
		t.Fatalf("empty = %#v", got)
	}
	if got := SplitLogLines("  \n  "); !reflect.DeepEqual(got, []string{}) {
		t.Fatalf("whitespace = %#v", got)
	}
	got := SplitLogLines("a\r\nb\nc\r")
	want := []string{"a", "b", "c"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("SplitLogLines = %#v, want %#v", got, want)
	}
}

func TestReadContainerLogsRaw(t *testing.T) {
	t.Parallel()
	text, err := ReadContainerLogs(io.NopCloser(bytes.NewBufferString("plain log line\n")))
	if err != nil {
		t.Fatalf("ReadContainerLogs: %v", err)
	}
	if text != "plain log line\n" {
		t.Fatalf("got %q", text)
	}
}

func TestReadContainerLogsMultiplexed(t *testing.T) {
	t.Parallel()
	// Docker multiplexed frame: 8-byte header + payload.
	// stream 1 = stdout, stream 2 = stderr; size is big-endian uint32 at offset 4.
	frame := func(stream byte, payload string) []byte {
		header := make([]byte, 8)
		header[0] = stream
		binary.BigEndian.PutUint32(header[4:], uint32(len(payload)))
		return append(header, payload...)
	}
	raw := append(frame(1, "out"), frame(2, "err")...)
	text, err := ReadContainerLogs(io.NopCloser(bytes.NewReader(raw)))
	if err != nil {
		t.Fatalf("ReadContainerLogs: %v", err)
	}
	if text != "outerr" {
		t.Fatalf("got %q, want outerr", text)
	}
}
