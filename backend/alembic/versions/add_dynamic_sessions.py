"""add dynamic_sessions table

Revision ID: add_dynamic_sessions
Revises: add_user_profile_picture
Create Date: 2026-02-05

Changes:
- Create dynamic_sessions table for AI-agent guided web task completion
- Indexes on company_id, user_id, and status
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_dynamic_sessions'
down_revision: Union[str, None] = 'add_user_profile_picture'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'dynamic_sessions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('goal', sa.Text(), nullable=False),
        sa.Column('goal_entities', sa.Text(), nullable=False, server_default='{}'),
        sa.Column(
            'status',
            sa.Enum('active', 'completed', 'abandoned', 'error', name='dynamic_session_status'),
            nullable=False,
            server_default='active',
        ),
        sa.Column('turn_log', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('step_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_input_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_output_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_cost', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_activity_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('dynamic_sessions', schema=None) as batch_op:
        batch_op.create_index('idx_dynamic_sessions_company', ['company_id'], unique=False)
        batch_op.create_index('idx_dynamic_sessions_user', ['user_id'], unique=False)
        batch_op.create_index('idx_dynamic_sessions_status', ['status'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('dynamic_sessions', schema=None) as batch_op:
        batch_op.drop_index('idx_dynamic_sessions_status')
        batch_op.drop_index('idx_dynamic_sessions_user')
        batch_op.drop_index('idx_dynamic_sessions_company')
    op.drop_table('dynamic_sessions')
