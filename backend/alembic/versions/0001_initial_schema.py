"""Initial multi-tenant schema migration (leave_dates & appointment notes)

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-27
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        schemas = [
            r[0]
            for r in conn.execute(
                text("SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'")
            ).fetchall()
            if r[0]
        ]
        for sch in schemas:
            conn.execute(text(f'ALTER TABLE "{sch}".doctors ADD COLUMN IF NOT EXISTS leave_dates TEXT;'))
            conn.execute(text(f'ALTER TABLE "{sch}".appointments ADD COLUMN IF NOT EXISTS notes TEXT;'))


def downgrade() -> None:
    pass
