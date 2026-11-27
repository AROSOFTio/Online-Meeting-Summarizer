"""Request/task scoped organization context; no mutable process-global tenant."""
from contextvars import ContextVar
from dataclasses import dataclass
from contextlib import contextmanager
from pathlib import Path

@dataclass(frozen=True)
class OrganizationContext:
    principal: object
    engine: object
    root: Path
    values: dict
    runtime: object = None

current = ContextVar("minuteseal_organization_context", default=None)

@contextmanager
def bind(context):
    token=current.set(context)
    try:yield
    finally:current.reset(token)

def scoped_path(path):
    """Reject stored paths outside the current organization's storage."""
    context=current.get()
    p=Path(path).resolve()
    if context is not None and not p.is_relative_to(context.root):
        from fastapi import HTTPException
        raise HTTPException(409,"Organization storage boundary violation")
    return p
