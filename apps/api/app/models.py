"""Import every model so Base.metadata is complete (used by Alembic)."""

from app.modules.audit.models import AuditLog  # noqa: F401
from app.modules.bookings.models import Booking, BookingItem  # noqa: F401
from app.modules.catalog.models import (  # noqa: F401
    PriceEntry,
    Service,
    ServiceCategory,
    ServiceOption,
    VehicleCategory,
)
from app.modules.customers.models import Customer  # noqa: F401
from app.modules.media.models import GalleryImage, Review  # noqa: F401
from app.modules.pricing.models import DiscountRule, DiscountRuleService  # noqa: F401
from app.modules.scheduling.models import (  # noqa: F401
    EmployeeSchedule,
    EmployeeService,
    ScheduleException,
)
from app.modules.site.models import BusinessHours, BusinessSettings  # noqa: F401
from app.modules.staff.models import Employee  # noqa: F401
from app.ratelimit import RateLimitCounter  # noqa: F401
