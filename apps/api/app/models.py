"""Import every model so Base.metadata is complete (used by Alembic)."""

from app.modules.catalog.models import (  # noqa: F401
    PriceEntry,
    Service,
    ServiceCategory,
    ServiceOption,
    VehicleCategory,
)
from app.modules.media.models import GalleryImage, Review  # noqa: F401
from app.modules.site.models import BusinessHours, BusinessSettings  # noqa: F401
from app.modules.staff.models import Employee  # noqa: F401
