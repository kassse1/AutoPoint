"""Staff profiles, skills, weekly schedules, business hours and date exceptions (holidays)."""

import uuid
from datetime import date, time
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.deps import SessionDep
from app.errors import AppError
from app.i18n import I18nText
from app.modules.audit.models import apply_changes, record_user
from app.modules.auth.models import User
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.modules.catalog.models import Service
from app.modules.scheduling.models import EmployeeSchedule, EmployeeService, ScheduleException
from app.modules.site.models import BusinessHours
from app.modules.staff.models import Employee

router = APIRouter(prefix="/admin", tags=["admin: staff & schedules"])

Reader = Annotated[CurrentUser, Depends(require(Permission.STAFF_READ))]
StaffWriter = Annotated[CurrentUser, Depends(require(Permission.STAFF_WRITE))]
ScheduleWriter = Annotated[CurrentUser, Depends(require(Permission.SCHEDULES_WRITE))]


class Interval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weekday: int = Field(ge=1, le=7)  # 1 = Monday
    starts: time
    ends: time

    @model_validator(mode="after")
    def _order(self) -> "Interval":
        if self.starts >= self.ends:
            raise ValueError("starts must be before ends")
        return self


class EmployeeIn(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)
    display_name: str = Field(min_length=2, max_length=100)
    position_i18n: I18nText
    bio_i18n: I18nText | None = None
    photo_url: str | None = Field(default=None, max_length=500)
    user_id: uuid.UUID | None = None  # login account; employees then see their own jobs
    is_public: bool = False
    is_bookable: bool = True
    is_active: bool = True
    sort_order: int = 0


class EmployeePatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    display_name: str | None = Field(default=None, min_length=2, max_length=100)
    position_i18n: I18nText | None = None
    bio_i18n: I18nText | None = None
    photo_url: str | None = Field(default=None, max_length=500)
    user_id: uuid.UUID | None = None
    is_public: bool | None = None
    is_bookable: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class EmployeeOut(EmployeeIn):
    id: int
    is_demo: bool
    service_ids: list[int]
    schedule: list[Interval]


class SkillsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_ids: list[int] = Field(max_length=200)


class ScheduleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intervals: list[Interval] = Field(max_length=50)


class ExceptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employee_id: int | None = None  # None = the whole studio (public holiday, closure)
    day: date
    is_closed: bool = True
    opens: time | None = None
    closes: time | None = None
    reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _hours(self) -> "ExceptionIn":
        if not self.is_closed and not (self.opens and self.closes and self.opens < self.closes):
            raise ValueError("an open day needs opens < closes")
        return self


class ExceptionOut(ExceptionIn):
    id: int


# --- employees ---------------------------------------------------------------------------------


def _employee(session: Session, employee_id: int) -> Employee:
    employee = session.get(Employee, employee_id)
    if employee is None:
        raise AppError(404, "EMPLOYEE_NOT_FOUND")
    return employee


def _out(session: Session, e: Employee) -> EmployeeOut:
    skills = session.scalars(
        select(EmployeeService.service_id).where(EmployeeService.employee_id == e.id)
    ).all()
    schedule = session.scalars(
        select(EmployeeSchedule)
        .where(EmployeeSchedule.employee_id == e.id)
        .order_by(EmployeeSchedule.weekday, EmployeeSchedule.starts_local)
    )
    return EmployeeOut(
        **EmployeeIn.model_validate(e).model_dump(),
        id=e.id,
        is_demo=e.is_demo,
        service_ids=sorted(skills),
        schedule=[
            Interval(weekday=s.weekday, starts=s.starts_local, ends=s.ends_local) for s in schedule
        ],
    )


def _check_user(session: Session, user_id: uuid.UUID | None) -> None:
    if user_id is not None and session.get(User, user_id) is None:
        raise AppError(422, "UNKNOWN_USER")


def _commit(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise AppError(409, "CONFLICT", error.orig.diag.message_primary) from error


@router.get("/employees")
def list_employees(user: Reader, session: SessionDep) -> list[EmployeeOut]:
    rows = session.scalars(select(Employee).order_by(Employee.sort_order, Employee.id))
    return [_out(session, e) for e in rows]


@router.get("/employees/{employee_id}")
def get_employee(employee_id: int, user: Reader, session: SessionDep) -> EmployeeOut:
    return _out(session, _employee(session, employee_id))


@router.post("/employees", status_code=201)
def create_employee(body: EmployeeIn, user: StaffWriter, session: SessionDep) -> EmployeeOut:
    _check_user(session, body.user_id)
    employee = Employee(**body.model_dump())
    session.add(employee)
    session.flush()
    record_user(session, user, "employee.created", "employee", employee.id)
    _commit(session)
    return _out(session, employee)


@router.patch("/employees/{employee_id}")
def update_employee(
    employee_id: int, body: EmployeePatch, user: StaffWriter, session: SessionDep
) -> EmployeeOut:
    employee = _employee(session, employee_id)
    data = body.model_dump(exclude_unset=True)
    _check_user(session, data.get("user_id"))
    before, after = apply_changes(employee, data)
    if after:
        record_user(
            session, user, "employee.updated", "employee", employee.id, before=before, after=after
        )
    _commit(session)
    return _out(session, employee)


@router.put("/employees/{employee_id}/services")
def set_skills(
    employee_id: int, body: SkillsIn, user: StaffWriter, session: SessionDep
) -> EmployeeOut:
    employee = _employee(session, employee_id)
    known = set(session.scalars(select(Service.id).where(Service.id.in_(body.service_ids))))
    if missing := set(body.service_ids) - known:
        raise AppError(422, "UNKNOWN_SERVICE", ", ".join(map(str, sorted(missing))))
    before = _out(session, employee).service_ids
    session.execute(delete(EmployeeService).where(EmployeeService.employee_id == employee_id))
    session.add_all(EmployeeService(employee_id=employee_id, service_id=s) for s in known)
    record_user(
        session,
        user,
        "employee.skills_set",
        "employee",
        employee_id,
        before={"service_ids": before},
        after={"service_ids": sorted(known)},
    )
    _commit(session)
    return _out(session, employee)


@router.put("/employees/{employee_id}/schedule")
def set_schedule(
    employee_id: int, body: ScheduleIn, user: ScheduleWriter, session: SessionDep
) -> EmployeeOut:
    """Replaces the weekly schedule. Existing bookings are not moved."""
    employee = _employee(session, employee_id)
    before = [i.model_dump(mode="json") for i in _out(session, employee).schedule]
    session.execute(delete(EmployeeSchedule).where(EmployeeSchedule.employee_id == employee_id))
    session.add_all(
        EmployeeSchedule(
            employee_id=employee_id, weekday=i.weekday, starts_local=i.starts, ends_local=i.ends
        )
        for i in body.intervals
    )
    try:
        session.flush()
    except IntegrityError as error:  # the exclusion constraint: overlapping intervals
        session.rollback()
        raise AppError(422, "OVERLAPPING_INTERVALS", "Intervals on one day overlap") from error
    record_user(
        session,
        user,
        "employee.schedule_set",
        "employee",
        employee_id,
        before={"intervals": before},
        after={"intervals": [i.model_dump(mode="json") for i in body.intervals]},
    )
    _commit(session)
    return _out(session, employee)


# --- business hours and exceptions ---------------------------------------------------------------


@router.get("/business-hours")
def get_hours(user: Reader, session: SessionDep) -> list[Interval]:
    rows = session.scalars(select(BusinessHours).order_by(BusinessHours.weekday))
    return [Interval(weekday=h.weekday, starts=h.opens, ends=h.closes) for h in rows]


@router.put("/business-hours")
def put_hours(body: ScheduleIn, user: ScheduleWriter, session: SessionDep) -> list[Interval]:
    """One interval per weekday; a missing weekday means closed."""
    if len({i.weekday for i in body.intervals}) != len(body.intervals):
        raise AppError(422, "ONE_INTERVAL_PER_DAY", "Studio hours allow one interval per day")
    before = [i.model_dump(mode="json") for i in get_hours(user, session)]
    session.execute(delete(BusinessHours))
    session.add_all(
        BusinessHours(weekday=i.weekday, opens=i.starts, closes=i.ends) for i in body.intervals
    )
    record_user(
        session,
        user,
        "business_hours.set",
        "settings",
        1,
        before={"hours": before},
        after={"hours": [i.model_dump(mode="json") for i in body.intervals]},
    )
    _commit(session)
    return get_hours(user, session)


@router.get("/schedule-exceptions")
def list_exceptions(
    user: Reader,
    session: SessionDep,
    date_from: date | None = None,
    date_to: date | None = None,
    employee_id: int | None = None,
) -> list[ExceptionOut]:
    query = select(ScheduleException).order_by(ScheduleException.day)
    if date_from:
        query = query.where(ScheduleException.day >= date_from)
    if date_to:
        query = query.where(ScheduleException.day <= date_to)
    if employee_id is not None:
        query = query.where(ScheduleException.employee_id == employee_id)
    return [ExceptionOut.model_validate(x, from_attributes=True) for x in session.scalars(query)]


@router.post("/schedule-exceptions", status_code=201)
def create_exception(body: ExceptionIn, user: ScheduleWriter, session: SessionDep) -> ExceptionOut:
    if body.employee_id is not None:
        _employee(session, body.employee_id)
    row = ScheduleException(**body.model_dump())
    if row.is_closed:
        row.opens = row.closes = None
    session.add(row)
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise AppError(
            409, "EXCEPTION_EXISTS", "There is already an exception for that day"
        ) from error
    record_user(
        session,
        user,
        "schedule_exception.created",
        "schedule_exception",
        row.id,
        after=body.model_dump(mode="json"),
    )
    _commit(session)
    return ExceptionOut.model_validate(row, from_attributes=True)


@router.delete("/schedule-exceptions/{exception_id}", status_code=204)
def delete_exception(exception_id: int, user: ScheduleWriter, session: SessionDep) -> None:
    row = session.get(ScheduleException, exception_id)
    if row is None:
        raise AppError(404, "EXCEPTION_NOT_FOUND")
    session.delete(row)
    record_user(
        session,
        user,
        "schedule_exception.deleted",
        "schedule_exception",
        exception_id,
        before={"day": row.day.isoformat(), "employee_id": row.employee_id},
    )
    _commit(session)
