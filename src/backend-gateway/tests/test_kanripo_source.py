import importlib
import sys
from types import ModuleType


class _FakeConverter:
    def convert(self, text: str) -> str:
        return text


def test_kanripo_source_imports_when_opencc_is_available(monkeypatch):
    module_name = "core.kanripo_source"
    sys.modules.pop(module_name, None)

    fake_opencc = ModuleType("opencc")
    fake_opencc.OpenCC = lambda *_args, **_kwargs: _FakeConverter()
    monkeypatch.setitem(sys.modules, "opencc", fake_opencc)

    try:
        module = importlib.import_module(module_name)
    finally:
        sys.modules.pop(module_name, None)

    extra_work = next(item for item in module.CURATED_WORKS if item["repo_id"] == "KR1d0001")
    assert extra_work["title"].startswith("《")
