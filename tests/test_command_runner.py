from types import SimpleNamespace

from cloudsprocket.models import CommandExecutionType, CommandSpec
from cloudsprocket.services import command_runner


def test_subprocess_command_executor_hides_windows_console(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(returncode=0, stdout="ok\n", stderr="")

    monkeypatch.setattr(command_runner.subprocess, "run", fake_run)

    spec = CommandSpec(
        action_id="test-process",
        execution_type=CommandExecutionType.PROCESS,
        program="aws",
        args=("sts", "get-caller-identity"),
    )

    result = command_runner.SubprocessCommandExecutor().execute(spec)

    assert result.succeeded
    assert captured["args"] == ["aws", "sts", "get-caller-identity"]
    kwargs = captured["kwargs"]
    if command_runner.os.name == "nt":
        assert kwargs["creationflags"] == command_runner.subprocess.CREATE_NO_WINDOW
        startupinfo = kwargs["startupinfo"]
        assert startupinfo.wShowWindow == command_runner.subprocess.SW_HIDE
        assert startupinfo.dwFlags & command_runner.subprocess.STARTF_USESHOWWINDOW
    else:
        assert "creationflags" not in kwargs
        assert "startupinfo" not in kwargs
