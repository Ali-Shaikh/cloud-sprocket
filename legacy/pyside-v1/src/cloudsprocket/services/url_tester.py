from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal

from cloudsprocket.models import DetailField


@dataclass(frozen=True, slots=True)
class UrlInspection:
    summary: str
    detail_fields: tuple[DetailField, ...] = ()


@dataclass(frozen=True, slots=True)
class UrlValidationResult:
    url: str
    succeeded: bool
    summary: str
    detail_fields: tuple[DetailField, ...] = ()


def analyse_url(url: str, *, now: datetime | None = None) -> UrlInspection:
    stripped_url = url.strip()
    if not stripped_url:
        return UrlInspection(summary="Paste a URL to inspect it.")

    parsed_url = urlsplit(stripped_url)
    if not parsed_url.scheme or not parsed_url.netloc:
        return UrlInspection(summary="Enter a valid URL to inspect it.")

    now_utc = now or datetime.now(UTC)
    detail_fields = [
        DetailField(label="Host", value=parsed_url.netloc),
        DetailField(label="Checked At", value=_format_datetime(now_utc)),
    ]
    query = parse_qs(parsed_url.query, keep_blank_values=True)
    if "X-Amz-Date" in query and "X-Amz-Expires" in query:
        signed_at_value = query.get("X-Amz-Date", [""])[0].strip()
        expires_in_value = query.get("X-Amz-Expires", [""])[0].strip()
        try:
            signed_at = datetime.strptime(signed_at_value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
            expires_in_seconds = int(expires_in_value)
        except ValueError:
            detail_fields.append(DetailField(label="Signature Type", value="AWS SigV4 query signature"))
            return UrlInspection(
                summary="This URL looks AWS-signed, but its expiry parameters could not be parsed.",
                detail_fields=tuple(detail_fields),
            )

        expires_at = signed_at + timedelta(seconds=expires_in_seconds)
        temporary_credentials = "X-Amz-Security-Token" in query
        detail_fields.extend(
            [
                DetailField(label="Signature Type", value="AWS SigV4 presigned URL"),
                DetailField(label="Signed At", value=_format_datetime(signed_at)),
                DetailField(label="Requested Duration", value=_format_duration(expires_in_seconds)),
                DetailField(label="Nominal Expiry", value=_format_datetime(expires_at)),
                DetailField(
                    label="Time Remaining",
                    value=_format_remaining(expires_at - now_utc),
                ),
            ]
        )
        if temporary_credentials:
            detail_fields.append(
                DetailField(
                    label="Temporary Credentials",
                    value="Present. Effective expiry may be earlier than the requested duration.",
                )
            )
        summary = (
            f"Nominal expiry is {_format_datetime(expires_at)}."
            if expires_at >= now_utc
            else f"This URL appears expired since {_format_datetime(expires_at)}."
        )
        return UrlInspection(summary=summary, detail_fields=tuple(detail_fields))

    if "Expires" in query:
        expires_value = query.get("Expires", [""])[0].strip()
        try:
            expires_at = datetime.fromtimestamp(int(expires_value), tz=UTC)
        except ValueError:
            return UrlInspection(
                summary="This URL exposes an Expires value, but it could not be parsed.",
                detail_fields=tuple(detail_fields),
            )
        detail_fields.extend(
            [
                DetailField(label="Signature Type", value="Expiry parameter detected"),
                DetailField(label="Nominal Expiry", value=_format_datetime(expires_at)),
                DetailField(label="Time Remaining", value=_format_remaining(expires_at - now_utc)),
            ]
        )
        summary = (
            f"Nominal expiry is {_format_datetime(expires_at)}."
            if expires_at >= now_utc
            else f"This URL appears expired since {_format_datetime(expires_at)}."
        )
        return UrlInspection(summary=summary, detail_fields=tuple(detail_fields))

    detail_fields.append(
        DetailField(
            label="Signature Type",
            value="No AWS presign expiry fields detected",
        )
    )
    return UrlInspection(
        summary="This URL does not expose AWS presign expiry fields. Live validation is still available.",
        detail_fields=tuple(detail_fields),
    )


class UrlValidationExecutor:
    def execute(self, url: str) -> UrlValidationResult:
        request = Request(
            url,
            headers={
                "Range": "bytes=0-0",
                "User-Agent": "CloudSprocket/1.0",
            },
            method="GET",
        )
        checked_at = _format_datetime(datetime.now(UTC))
        try:
            with urlopen(request, timeout=10) as response:
                status_code = getattr(response, "status", response.getcode())
                reason = getattr(response, "reason", "") or ""
                headers = response.headers
                detail_fields = _validation_fields(
                    checked_at=checked_at,
                    status_code=status_code,
                    reason=reason,
                    content_type=headers.get("Content-Type", "").strip(),
                    content_length=headers.get("Content-Length", "").strip(),
                )
                return UrlValidationResult(
                    url=url,
                    succeeded=200 <= status_code < 400,
                    summary=f"Live validation succeeded with HTTP {status_code}.",
                    detail_fields=detail_fields,
                )
        except HTTPError as exc:
            detail_fields = _validation_fields(
                checked_at=checked_at,
                status_code=exc.code,
                reason=str(exc.reason or "").strip(),
                content_type=exc.headers.get("Content-Type", "").strip() if exc.headers else "",
                content_length=exc.headers.get("Content-Length", "").strip() if exc.headers else "",
            )
            return UrlValidationResult(
                url=url,
                succeeded=False,
                summary=f"Live validation failed with HTTP {exc.code}.",
                detail_fields=detail_fields,
            )
        except URLError as exc:
            return UrlValidationResult(
                url=url,
                succeeded=False,
                summary=f"Live validation could not reach the server: {exc.reason}",
                detail_fields=(DetailField(label="Checked At", value=checked_at),),
            )


class _UrlValidationTask(QRunnable):
    def __init__(
        self,
        *,
        token: int,
        url: str,
        executor: UrlValidationExecutor,
        publish_result: Callable[[int, UrlValidationResult], None],
    ) -> None:
        super().__init__()
        self._token = token
        self._url = url
        self._executor = executor
        self._publish_result = publish_result

    def run(self) -> None:
        result = self._executor.execute(self._url)
        self._publish_result(self._token, result)


class BackgroundUrlValidator(QObject):
    _result_ready = Signal(int, object)

    def __init__(
        self,
        *,
        executor: UrlValidationExecutor | None = None,
        thread_pool: QThreadPool | None = None,
    ) -> None:
        super().__init__()
        self._executor = executor or UrlValidationExecutor()
        self._thread_pool = thread_pool or QThreadPool.globalInstance()
        self._callbacks: dict[int, Callable[[UrlValidationResult], None]] = {}
        self._next_token = 1
        self._result_ready.connect(self._deliver_result)

    def run(self, url: str, on_finished: Callable[[UrlValidationResult], None]) -> None:
        token = self._next_token
        self._next_token += 1
        self._callbacks[token] = on_finished
        task = _UrlValidationTask(
            token=token,
            url=url,
            executor=self._executor,
            publish_result=self._result_ready.emit,
        )
        self._thread_pool.start(task)

    def _deliver_result(self, token: int, result: UrlValidationResult) -> None:
        callback = self._callbacks.pop(token, None)
        if callback is not None:
            callback(result)


def _validation_fields(
    *,
    checked_at: str,
    status_code: int,
    reason: str,
    content_type: str,
    content_length: str,
) -> tuple[DetailField, ...]:
    detail_fields = [
        DetailField(label="Checked At", value=checked_at),
        DetailField(label="HTTP Status", value=f"{status_code} {reason}".strip()),
    ]
    if content_type:
        detail_fields.append(DetailField(label="Content Type", value=content_type))
    if content_length:
        detail_fields.append(DetailField(label="Content Length", value=content_length))
    return tuple(detail_fields)


def _format_datetime(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


def _format_duration(total_seconds: int) -> str:
    if total_seconds % 86400 == 0:
        days = total_seconds // 86400
        return f"{days} day" if days == 1 else f"{days} days"
    if total_seconds % 3600 == 0:
        hours = total_seconds // 3600
        return f"{hours} hour" if hours == 1 else f"{hours} hours"
    if total_seconds >= 60:
        minutes = total_seconds // 60
        return f"{minutes} minute" if minutes == 1 else f"{minutes} minutes"
    return f"{total_seconds} seconds"


def _format_remaining(delta: timedelta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds < 0:
        return f"Expired {_format_duration(abs(total_seconds))} ago"
    return f"{_format_duration(total_seconds)} remaining"
