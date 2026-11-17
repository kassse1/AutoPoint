"""Admin commands. Create the first owner on a fresh install:

    python -m app.manage create-user --email owner@studio.kz --name "Имя" --role owner

The password is asked interactively (or read from AUTOPOINT_PASSWORD for automation).

    python -m app.manage grant-app-role [--role autopoint_app]

Gives the restricted application role access to every table, except changing or deleting
audit log rows. Run as the table owner after migrations (compose.prod.yml does it on start).
"""

import argparse
import getpass
import os
import sys

from sqlalchemy import Connection, select, text

import app.models  # noqa: F401 - all mappers, run standalone (fresh database)
from app.db import SessionLocal, engine
from app.modules.audit.models import record
from app.modules.auth.models import ROLES, User
from app.modules.auth.security import hash_password


def create_user(email: str, name: str, role: str, password: str) -> None:
    if len(password) < 10:
        sys.exit("Password must be at least 10 characters")
    with SessionLocal.begin() as session:
        if session.scalar(select(User.id).where(User.email == email)):
            sys.exit(f"User {email} already exists")
        user = User(email=email, full_name=name, role=role, password_hash=hash_password(password))
        session.add(user)
        session.flush()
        record(
            session,
            action="user.created",
            entity_type="user",
            entity_id=user.id,
            actor_kind="system",
            after={"email": email, "role": role, "via": "cli"},
        )
    print(f"Created {role} {email}")


APP_ROLE = "autopoint_app"


def grant_app_role(connection: Connection, role: str = APP_ROLE) -> bool:
    """Idempotent. Returns False when the role does not exist (single-role setups)."""
    if not connection.scalar(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": role}):
        return False
    quoted = connection.dialect.identifier_preparer.quote(role)
    for statement in (
        f"GRANT USAGE ON SCHEMA public TO {quoted}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {quoted}",
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {quoted}",
        # Threat T16: the audit log is append-only for the application.
        f"REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM {quoted}",
    ):
        connection.execute(text(statement))
    return True


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.manage")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-user")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--role", choices=ROLES, required=True)
    grant = sub.add_parser("grant-app-role")
    grant.add_argument("--role", default=APP_ROLE)
    args = parser.parse_args()
    if args.command == "grant-app-role":
        with engine.begin() as connection:
            done = grant_app_role(connection, args.role)
        print(f"Grants applied to {args.role}" if done else f"Role {args.role} not found: skipped")
        return
    password = os.environ.get("AUTOPOINT_PASSWORD") or getpass.getpass("Password: ")
    create_user(args.email.strip(), args.name.strip(), args.role, password)


if __name__ == "__main__":
    main()
