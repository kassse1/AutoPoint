from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import SessionDep
from app.modules.audit.models import apply_changes, record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.site.models import BusinessSettings, SiteSettings, get_site_settings

router = APIRouter(prefix="/admin/settings", tags=["admin: settings"])

Reader = Annotated[CurrentUser, Depends(require(Permission.STAFF_READ))]
Writer = Annotated[CurrentUser, Depends(require(Permission.SETTINGS_WRITE))]


@router.get("")
def read_settings(user: Reader, session: SessionDep) -> SiteSettings:
    return get_site_settings(session)


@router.put("")
def write_settings(body: SiteSettings, user: Writer, session: SessionDep) -> SiteSettings:
    """Full replace, validated by SiteSettings (unknown fields are rejected)."""
    row = session.get(BusinessSettings, 1)
    data = body.model_dump(mode="json")
    if row is None:
        row = BusinessSettings(id=1, data={})
        session.add(row)
    before, after = apply_changes(row, {"data": data})
    if after:
        changed = {k for k in data if before.get("data", {}).get(k) != data[k]}
        record_user(
            session,
            user,
            "settings.updated",
            "settings",
            1,
            before={k: before.get("data", {}).get(k) for k in changed},
            after={k: data[k] for k in changed},
        )
    session.commit()
    return SiteSettings.model_validate(row.data)
