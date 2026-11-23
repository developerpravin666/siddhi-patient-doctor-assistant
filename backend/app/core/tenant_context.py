import contextvars
from typing import Optional

# Holds the active tenant ID or schema name overridden by Super Admin for the current request
tenant_override_cv: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("tenant_override_cv", default=None)


def get_tenant_override() -> Optional[str]:
    """Returns the current request's tenant override if set by Super Admin."""
    return tenant_override_cv.get()


def set_tenant_override(tenant_id_or_schema: Optional[str]) -> contextvars.Token:
    """Sets the tenant override for the current async task context."""
    return tenant_override_cv.set(tenant_id_or_schema)


def reset_tenant_override(token: contextvars.Token) -> None:
    """Resets the tenant override to its previous state."""
    try:
        tenant_override_cv.reset(token)
    except Exception:
        pass
