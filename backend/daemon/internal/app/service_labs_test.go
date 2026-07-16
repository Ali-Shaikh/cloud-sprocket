// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"strings"
	"testing"
)

type trackedHTTPBody struct {
	reader *strings.Reader
	closed bool
}

func (b *trackedHTTPBody) Read(buffer []byte) (int, error) {
	return b.reader.Read(buffer)
}

func (b *trackedHTTPBody) Close() error {
	b.closed = true
	return nil
}

func TestDrainAndCloseHTTPBody(t *testing.T) {
	t.Parallel()
	body := &trackedHTTPBody{reader: strings.NewReader("health response")}

	drainAndCloseHTTPBody(body)
	if body.reader.Len() != 0 {
		t.Fatalf("response body has %d unread bytes", body.reader.Len())
	}
	if !body.closed {
		t.Fatal("response body was not closed")
	}
}
