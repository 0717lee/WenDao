"""Lightweight lazy proxy for expensive service objects.

The proxy delays construction until an attribute is actually accessed.
Tests can still monkeypatch attributes on the proxy directly without
triggering the underlying initialization.
"""

from __future__ import annotations

from typing import Any, Callable, Generic, TypeVar

T = TypeVar("T")


class LazyProxy(Generic[T]):
    """Proxy that constructs the wrapped object on first real use."""

    def __init__(self, factory: Callable[[], T]):
        object.__setattr__(self, "_factory", factory)
        object.__setattr__(self, "_instance", None)
        object.__setattr__(self, "_overrides", {})

    def _get_instance(self) -> T:
        instance = object.__getattribute__(self, "_instance")
        if instance is None:
            instance = object.__getattribute__(self, "_factory")()
            object.__setattr__(self, "_instance", instance)
        return instance

    def __getattr__(self, name: str) -> Any:
        overrides = object.__getattribute__(self, "_overrides")
        if name in overrides:
            return overrides[name]
        return getattr(self._get_instance(), name)

    def __setattr__(self, name: str, value: Any) -> None:
        if name.startswith("_"):
            object.__setattr__(self, name, value)
            return
        overrides = object.__getattribute__(self, "_overrides")
        overrides[name] = value

    def __bool__(self) -> bool:
        return True

    def reset(self) -> None:
        """Drop the cached instance and any test overrides."""
        object.__setattr__(self, "_instance", None)
        object.__setattr__(self, "_overrides", {})
