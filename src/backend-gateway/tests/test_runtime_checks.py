import os
import sys

import pytest

from core.embeddings import WenDaoEmbeddings
from core.runtime_checks import (
    apply_zhipu_env_alias,
    expected_venv_python,
    get_zhipu_api_key,
    runtime_health_snapshot,
)


def test_apply_zhipu_env_alias_promotes_legacy_key(monkeypatch):
    monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)
    monkeypatch.setenv("ZHIPU_API_KEY", "legacy-key")

    assert apply_zhipu_env_alias() is True
    assert os.getenv("ZHIPUAI_API_KEY") == "legacy-key"
    assert get_zhipu_api_key() == "legacy-key"


def test_runtime_health_snapshot_reports_expected_venv(monkeypatch, tmp_path):
    venv_python = expected_venv_python(tmp_path)
    venv_python.parent.mkdir(parents=True)
    venv_python.write_text("", encoding="utf-8")

    monkeypatch.setattr(sys, "executable", str(tmp_path / "python.exe"))
    monkeypatch.setenv("ZHIPUAI_API_KEY", "canonical-key")
    monkeypatch.setenv("ZHIPU_API_KEY", "legacy-key")

    snapshot = runtime_health_snapshot(tmp_path)

    assert snapshot["expected_venv_python"] == str(venv_python)
    assert snapshot["using_project_venv"] is False
    assert snapshot["zhipu_env_conflict"] is True


def test_embeddings_can_pin_backend_to_sklearn(tmp_path):
    embeddings = WenDaoEmbeddings(cache_dir=str(tmp_path), preferred_backend="sklearn")

    assert embeddings.active_backend == "sklearn"
    assert "sklearn" in embeddings.available_backends


def test_embeddings_strict_backend_raises_when_backend_missing(tmp_path, monkeypatch):
    monkeypatch.delenv("ZHIPUAI_API_KEY", raising=False)
    monkeypatch.delenv("ZHIPU_API_KEY", raising=False)

    with pytest.raises(RuntimeError):
        WenDaoEmbeddings(
            cache_dir=str(tmp_path),
            preferred_backend="zhipuai",
            strict_backend=True,
        )
