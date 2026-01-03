"""Add invites table and user status/role expansion

Revision ID: add_invites_user_status
Revises: 0acd3e6b9445
Create Date: 2025-12-24

Changes:
- Create invites table for email invitations
- Add status column to users (active/suspended)
- Change role column from Enum to String for SQLite compatibility
- Map 'regular' role to 'editor' (preserves permissions)
"""
from typing import Sequence, Union
from datetime import datetime, timedelta

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_invites_user_status'
down_revision: Union[str, None] = '0acd3e6b9445'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create invites table
    op.create_table(
        'invites',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('token', sa.String(36), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='viewer'),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('invited_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invited_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('invites', schema=None) as batch_op:
        batch_op.create_index('idx_invites_token', ['token'], unique=True)
        batch_op.create_index('idx_invites_company', ['company_id'], unique=False)
        batch_op.create_index('idx_invites_email', ['email'], unique=False)

    # Modify users table - SQLite requires batch mode for column changes
    # This recreates the table with the new schema
    with op.batch_alter_table('users', schema=None) as batch_op:
        # Add status column with default 'active'
        batch_op.add_column(
            sa.Column('status', sa.String(20), nullable=False, server_default='active')
        )

        # Change role column from Enum to String
        # SQLite batch mode handles this by recreating the table
        batch_op.alter_column(
            'role',
            existing_type=sa.Enum('admin', 'regular', name='user_role'),
            type_=sa.String(20),
            existing_nullable=False,
            server_default='viewer'
        )

    # Update existing 'regular' roles to 'editor'
    op.execute("UPDATE users SET role = 'editor' WHERE role = 'regular'")


def downgrade() -> None:
    # Update 'editor' roles back to 'regular'
    op.execute("UPDATE users SET role = 'regular' WHERE role = 'editor'")

    # Revert users table changes
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('status')
        batch_op.alter_column(
            'role',
            existing_type=sa.String(20),
            type_=sa.Enum('admin', 'regular', name='user_role'),
            existing_nullable=False
        )

    # Drop invites table and indexes
    with op.batch_alter_table('invites', schema=None) as batch_op:
        batch_op.drop_index('idx_invites_email')
        batch_op.drop_index('idx_invites_company')
        batch_op.drop_index('idx_invites_token')
    op.drop_table('invites')
