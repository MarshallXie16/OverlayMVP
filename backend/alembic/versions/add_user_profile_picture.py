"""add user profile picture

Revision ID: add_user_profile_picture
Revises: add_user_timezone
Create Date: 2025-01-20

Changes:
- Add profile_picture_url column to users table
Note: This migration was reconstructed from database state.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_user_profile_picture'
down_revision: Union[str, None] = 'add_user_timezone'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('profile_picture_url', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'profile_picture_url')
