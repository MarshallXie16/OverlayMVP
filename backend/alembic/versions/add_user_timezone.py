"""add user timezone field

Revision ID: add_user_timezone
Revises: add_invites_user_status
Create Date: 2025-01-11 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_user_timezone'
down_revision = 'add_invites_user_status'
branch_labels = None
depends_on = None


def upgrade():
    """Add timezone field to users table."""
    op.add_column('users', sa.Column('timezone', sa.String(50), nullable=True))


def downgrade():
    """Remove timezone field from users table."""
    op.drop_column('users', 'timezone')
