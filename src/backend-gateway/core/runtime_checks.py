from __future__ import annotations

import functools
import inspect
import logging
import os
import sys
from pathlib import Path
from typing import Any

CANONICAL_ZHIPU_ENV = "ZHIPUAI_API_KEY"
LEGACY_ZHIPU_ENV = "ZHIPU_API_KEY"


def backend_root(module_file: str | None = None) -> Path:
    base = Path(module_file or __file__).resolve()
    return base.parent.parent


def expected_venv_python(project_root: Path | None = None) -> Path:
    root = project_root or backend_root()
    if os.name == "nt":
        return root / ".venv" / "Scripts" / "python.exe"
    return root / ".venv" / "bin" / "python"


def get_zhipu_api_key() -> str:
    return os.getenv(CANONICAL_ZHIPU_ENV, "") or os.getenv(LEGACY_ZHIPU_ENV, "")


def apply_zhipu_env_alias() -> bool:
    canonical = os.getenv(CANONICAL_ZHIPU_ENV, "")
    legacy = os.getenv(LEGACY_ZHIPU_ENV, "")
    if not canonical and legacy:
        os.environ[CANONICAL_ZHIPU_ENV] = legacy
        return True
    return False


def apply_fastapi_starlette_router_patch(logger: logging.Logger | None = None) -> bool:
    from starlette import routing as starlette_routing

    router_cls = starlette_routing.Router
    params = inspect.signature(router_cls.__init__).parameters
    if "on_startup" in params and "on_shutdown" in params:
        return False
    if getattr(router_cls, "_wendao_compat_patch", False):
        return True

    original_init = router_cls.__init__

    @functools.wraps(original_init)
    def patched_init(
        self: Any,
        *args: Any,
        on_startup: list[Any] | tuple[Any, ...] | None = None,
        on_shutdown: list[Any] | tuple[Any, ...] | None = None,
        **kwargs: Any,
    ) -> None:
        original_init(self, *args, **kwargs)
        current_startup = list(getattr(self, "on_startup", []))
        current_shutdown = list(getattr(self, "on_shutdown", []))
        if on_startup:
            current_startup.extend(on_startup)
        if on_shutdown:
            current_shutdown.extend(on_shutdown)
        self.on_startup = current_startup
        self.on_shutdown = current_shutdown

    router_cls.__init__ = patched_init
    router_cls._wendao_compat_patch = True  # type: ignore[attr-defined]
    if logger:
        logger.warning(
            "检测到 FastAPI / Starlette 版本不匹配，已启用 Router 兼容补丁；建议优先使用项目 .venv 解释器运行"
        )
    return True


def prepare_runtime_environment(logger: logging.Logger | None = None) -> None:
    apply_zhipu_env_alias()
    apply_fastapi_starlette_router_patch(logger)


def runtime_health_snapshot(project_root: Path | None = None) -> dict[str, Any]:
    root = project_root or backend_root()
    venv_python = expected_venv_python(root)
    canonical = os.getenv(CANONICAL_ZHIPU_ENV, "")
    legacy = os.getenv(LEGACY_ZHIPU_ENV, "")
    using_project_venv = venv_python.exists() and Path(sys.executable).resolve() == venv_python.resolve()

    return {
        "python_executable": sys.executable,
        "expected_venv_python": str(venv_python) if venv_python.exists() else None,
        "using_project_venv": using_project_venv,
        "zhipu_alias_active": bool(not canonical and legacy),
        "zhipu_env_conflict": bool(canonical and legacy and canonical != legacy),
        "compat_patch_active": "on_startup" not in inspect.signature(__import__("starlette.routing", fromlist=["Router"]).Router.__init__).parameters,
    }


def log_startup_checks(logger: logging.Logger, project_root: Path | None = None) -> None:
    snapshot = runtime_health_snapshot(project_root)
    expected = snapshot["expected_venv_python"]

    if expected and not snapshot["using_project_venv"]:
        logger.warning(
            "当前 Python 解释器不是项目 .venv：%s；建议改用 %s",
            snapshot["python_executable"],
            expected,
        )

    if snapshot["zhipu_alias_active"]:
        logger.warning("检测到旧变量 ZHIPU_API_KEY，当前已兼容映射到 ZHIPUAI_API_KEY，建议尽快统一配置")

    if snapshot["zhipu_env_conflict"]:
        logger.warning("ZHIPUAI_API_KEY 与 ZHIPU_API_KEY 同时存在且值不一致，请尽快统一配置")

