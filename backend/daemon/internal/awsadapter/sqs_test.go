package awsadapter

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

func TestQueueNameFromURLParsesStandardAndLocalEndpoints(t *testing.T) {
	tests := []struct {
		queueURL string
		want     string
	}{
		{
			queueURL: "https://sqs.us-east-1.amazonaws.com/123456789012/process-order",
			want:     "process-order",
		},
		{
			queueURL: "http://localhost:4566/000000000000/cloudsprocket-events",
			want:     "cloudsprocket-events",
		},
	}

	for _, test := range tests {
		if got := queueNameFromURL(test.queueURL); got != test.want {
			t.Fatalf("queueNameFromURL(%q) = %q, want %q", test.queueURL, got, test.want)
		}
	}
}

func TestSqsQueueSummaryMapsAttributes(t *testing.T) {
	got := sqsQueueSummary(
		"http://localhost:4566/000000000000/orders",
		map[string]string{
			string(types.QueueAttributeNameApproximateNumberOfMessages):           "12",
			string(types.QueueAttributeNameApproximateNumberOfMessagesNotVisible): "3",
			string(types.QueueAttributeNameApproximateNumberOfMessagesDelayed):    "1",
			string(types.QueueAttributeNameVisibilityTimeout):                     "30",
			string(types.QueueAttributeNameCreatedTimestamp):                      "1718452800",
			string(types.QueueAttributeNameQueueArn):                              "arn:aws:sqs:us-east-1:000000000000:orders",
			string(types.QueueAttributeNameDelaySeconds):                          "0",
			string(types.QueueAttributeNameReceiveMessageWaitTimeSeconds):         "20",
		},
	)

	if got.QueueName != "orders" {
		t.Fatalf("QueueName = %q", got.QueueName)
	}
	if got.ApproximateNumberOfMessages != 12 || got.ApproximateNumberOfMessagesNotVisible != 3 {
		t.Fatalf("depth = %d / in-flight = %d", got.ApproximateNumberOfMessages, got.ApproximateNumberOfMessagesNotVisible)
	}
	if got.VisibilityTimeout != 30 || got.ReceiveMessageWaitTimeSeconds != 20 {
		t.Fatalf("timeouts = %d / %d", got.VisibilityTimeout, got.ReceiveMessageWaitTimeSeconds)
	}
	if got.QueueArn == "" {
		t.Fatalf("expected QueueArn to be mapped")
	}
}

func TestSqsMessageSummaryMapsBodyAndAttributes(t *testing.T) {
	body := `{"orderId":"ord-001"}`
	messageID := "msg-123"
	got := sqsMessageSummary(types.Message{
		MessageId: &messageID,
		Body:      &body,
		Attributes: map[string]string{
			string(types.MessageSystemAttributeNameSentTimestamp):            "1718452800",
			string(types.MessageSystemAttributeNameApproximateReceiveCount): "2",
		},
	})

	if got.MessageID != messageID || got.Body != body {
		t.Fatalf("message = %+v", got)
	}
	if got.SentTimestamp != 1718452800 || got.ApproximateReceiveCount != 2 {
		t.Fatalf("attributes = %d / %d", got.SentTimestamp, got.ApproximateReceiveCount)
	}
}