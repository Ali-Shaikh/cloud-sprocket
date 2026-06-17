import json
import os


def handler(event, context):
    path = event.get("rawPath") or event.get("path") or "/"
    request_context = event.get("requestContext") or {}
    http = request_context.get("http") or {}
    method = http.get("method") or event.get("httpMethod") or "GET"

    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps({
            "ok": True,
            "message": "Hello from the CloudSprocket Python Postgres API sample",
            "method": method,
            "path": path,
            "database_configured": bool(os.environ.get("DATABASE_URL")),
        }),
    }