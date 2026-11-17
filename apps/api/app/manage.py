"""Admin commands. Create the first owner on a fresh install:

    python -m app.manage create-user --email owner@studio.kz --name "Имя" --role owner

The password is asked interactively (or read from AUTOPOINT_PASSWORD for automation).
"""

import argparse
import getpass
import os
import sys

from sqlalchemy import select

import app.models  # noqa: F401 - all mappers, run standalone (fresh database)
from app.db import SessionLocal
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


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.manage")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-user")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--role", choices=ROLES, required=True)
    args = parser.parse_args()
    password = os.environ.get("AUTOPOINT_PASSWORD") or getpass.getpass("Password: ")
    create_user(args.email.strip(), args.name.strip(), args.role, password)


if __name__ == "__main__":
    main()
