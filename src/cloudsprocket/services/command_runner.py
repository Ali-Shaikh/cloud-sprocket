from __future__ import annotations

import os
import subprocess
from collections.abc import Callable
from typing import Protocol

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal

from cloudsprocket.models import CommandExecutionType, CommandResult, CommandSpec


class CommandExecutor(Protocol):
    def execute(self, spec: CommandSpec) -> CommandResult:
        ...


class SubprocessCommandExecutor:
    def execute(self, spec: CommandSpec) -> CommandResult:
        if spec.execution_type != CommandExecutionType.PROCESS or not spec.program:
            raise ValueError(f"Unsupported command spec for subprocess execution: {spec.execution_type}")

        env = os.environ.copy()
        env.update(dict(spec.env))
        completed = subprocess.run(
            [spec.program, *spec.args],
            capture_output=True,
            text=True,
            cwd=str(spec.cwd) if spec.cwd else None,
            env=env,
            check=False,
        )
        return CommandResult(
            spec=spec,
            exit_code=completed.returncode,
            stdout=completed.stdout.strip(),
            stderr=completed.stderr.strip(),
            summary=spec.summary,
            succeeded=completed.returncode == 0,
        )


class _CommandTask(QRunnable):
    def __init__(
        self,
        *,
        token: int,
        spec: CommandSpec,
        executor: CommandExecutor,
        publish_result: Callable[[int, CommandResult], None],
    ) -> None:
        super().__init__()
        self._token = token
        self._spec = spec
        self._executor = executor
        self._publish_result = publish_result

    def run(self) -> None:
        result = self._executor.execute(self._spec)
        self._publish_result(self._token, result)


class BackgroundCommandRunner(QObject):
    _result_ready = Signal(int, object)

    def __init__(
        self,
        *,
        executor: CommandExecutor | None = None,
        thread_pool: QThreadPool | None = None,
    ) -> None:
        super().__init__()
        self._executor = executor or SubprocessCommandExecutor()
        self._thread_pool = thread_pool or QThreadPool.globalInstance()
        self._callbacks: dict[int, Callable[[CommandResult], None]] = {}
        self._next_token = 1
        self._result_ready.connect(self._deliver_result)

    def run(self, spec: CommandSpec, on_finished: Callable[[CommandResult], None]) -> None:
        token = self._next_token
        self._next_token += 1
        self._callbacks[token] = on_finished
        task = _CommandTask(
            token=token,
            spec=spec,
            executor=self._executor,
            publish_result=self._result_ready.emit,
        )
        self._thread_pool.start(task)

    def _deliver_result(self, token: int, result: CommandResult) -> None:
        callback = self._callbacks.pop(token, None)
        if callback is not None:
            callback(result)
