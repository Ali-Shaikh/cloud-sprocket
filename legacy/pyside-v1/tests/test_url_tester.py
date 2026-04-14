from datetime import UTC, datetime

from cloudsprocket.services.url_tester import analyse_url


def test_analyse_url_parses_sigv4_presigned_expiry() -> None:
    url = (
        "https://example-bucket.s3.eu-west-2.amazonaws.com/logs/app.log"
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256"
        "&X-Amz-Date=20260325T100000Z"
        "&X-Amz-Expires=7200"
        "&X-Amz-Security-Token=token"
    )

    inspection = analyse_url(url, now=datetime(2026, 3, 25, 11, 0, tzinfo=UTC))
    labels = {field.label for field in inspection.detail_fields}

    assert "Nominal expiry is" in inspection.summary
    assert {"Signature Type", "Requested Duration", "Nominal Expiry", "Time Remaining"} <= labels


def test_analyse_url_reports_non_presigned_urls() -> None:
    inspection = analyse_url("https://example.com/download")

    assert "does not expose AWS presign expiry fields" in inspection.summary
