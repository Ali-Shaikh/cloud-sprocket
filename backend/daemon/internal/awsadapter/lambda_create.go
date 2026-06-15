package awsadapter

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
)

const defaultLocalLambdaRoleARN = "arn:aws:iam::000000000000:role/cloudsprocket-lambda"

func defaultHandlerForRuntime(runtime string) string {
	if strings.HasPrefix(runtime, "python") {
		return "lambda_function.handler"
	}
	return "index.handler"
}

func starterFunctionZip(runtime string, handler string) ([]byte, string, error) {
	handler = strings.TrimSpace(handler)
	if handler == "" {
		handler = defaultHandlerForRuntime(runtime)
	}

	var filename string
	var source string
	switch {
	case strings.HasPrefix(runtime, "nodejs"):
		filename = "index.js"
		source = `exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: "Hello from CloudSprocket" }),
  };
};
`
	case strings.HasPrefix(runtime, "python"):
		filename = "lambda_function.py"
		source = `def handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello from CloudSprocket",
    }
`
	default:
		return nil, "", fmt.Errorf("runtime %q is not supported for starter function create", runtime)
	}

	buf := &bytes.Buffer{}
	writer := zip.NewWriter(buf)
	entry, err := writer.Create(filename)
	if err != nil {
		return nil, "", err
	}
	if _, err := entry.Write([]byte(source)); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return buf.Bytes(), handler, nil
}