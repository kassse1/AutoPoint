"""Demo content for a fresh database: `python -m app.seed`.

Everything here is DEMO data: prices, contacts, team and reviews are examples, flagged with
`is_demo` / `SiteSettings.is_demo` so the website labels them. Runs only on an empty database.
"""

import logging
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.orm import Session

import app.models  # noqa: F401 - all mappers, run standalone (fresh database)
from app.db import SessionLocal
from app.modules.catalog.models import (
    PriceEntry,
    Service,
    ServiceCategory,
    ServiceOption,
    VehicleCategory,
)
from app.modules.media.models import GalleryImage, Review
from app.modules.pricing.models import DiscountRule, DiscountRuleService
from app.modules.scheduling.models import EmployeeSchedule, EmployeeService
from app.modules.site.models import BusinessHours, BusinessSettings, SiteSettings
from app.modules.staff.models import Employee

logger = logging.getLogger(__name__)


def t(ru, kk, en):
    return {"ru": ru, "kk": kk, "en": en}


def steps(*items):
    """steps(("ru title", "ru text", "kk title", "kk text", "en title", "en text"), ...)"""
    return {
        loc: [{"title": s[i], "text": s[i + 1]} for s in items]
        for loc, i in (("ru", 0), ("kk", 2), ("en", 4))
    }


# code, name, examples, price factor, duration factor
VEHICLES = [
    ("compact", t("Компакт", "Шағын", "Compact"), t("Kia Rio, Hyundai Accent", "Kia Rio, Hyundai Accent", "Kia Rio, Hyundai Accent"), 0.85, 0.9),
    ("sedan", t("Седан", "Седан", "Sedan"), t("Toyota Camry, Hyundai Sonata", "Toyota Camry, Hyundai Sonata", "Toyota Camry, Hyundai Sonata"), 1.0, 1.0),
    ("crossover", t("Кроссовер", "Кроссовер", "Crossover"), t("Toyota RAV4, Kia Sportage", "Toyota RAV4, Kia Sportage", "Toyota RAV4, Kia Sportage"), 1.15, 1.1),
    ("suv", t("Внедорожник", "Жол талғамайтын көлік", "SUV"), t("Toyota Land Cruiser Prado, Lexus GX", "Toyota Land Cruiser Prado, Lexus GX", "Toyota Land Cruiser Prado, Lexus GX"), 1.3, 1.2),
    ("large_suv", t("Большой внедорожник", "Үлкен жол талғамайтын көлік", "Large SUV"), t("Toyota Land Cruiser 300, Lexus LX", "Toyota Land Cruiser 300, Lexus LX", "Toyota Land Cruiser 300, Lexus LX"), 1.5, 1.35),
]  # fmt: skip

CATEGORIES = [
    ("exterior", t("Кузов", "Шанақ", "Exterior")),
    ("protection", t("Защита кузова", "Шанақты қорғау", "Paint protection")),
    ("interior", t("Салон", "Салон", "Interior")),
    ("glass-optics", t("Стёкла и оптика", "Әйнектер мен шамдар", "Glass & lights")),
]

# Option tuple: code, group_code, is_default, sedan price, sedan minutes, name
SERVICES = [
    dict(
        slug="exterior-detailing", category="exterior", featured=False, addon=True,
        price=25_000, minutes=180,
        name=t("Экстерьерный детейлинг", "Сыртқы детейлинг", "Exterior detailing"),
        summary=t(
            "Бережная мойка, очистка от битума и металлических вкраплений, защитный воск.",
            "Жұмсақ жуу, битум мен металл бөлшектерінен тазалау, қорғаныс балауызы.",
            "Safe wash, tar and iron fallout removal, protective wax.",
        ),
        description=t(
            "Комплексная очистка кузова, дисков и проёмов без риска новых царапин. Подходит как регулярный уход и как подготовка к полировке или нанесению покрытия.",
            "Жаңа сызаттарсыз шанақты, дискілерді және есік ойықтарын кешенді тазалау. Тұрақты күтімге де, жылтыратуға немесе жабын жағуға дайындыққа да қолайлы.",
            "Thorough cleaning of paint, wheels and door jambs without inflicting new scratches. Works as regular care and as preparation for polishing or coating.",
        ),
        includes=t(
            ["Бесконтактная предмойка активной пеной", "Ручная мойка методом двух вёдер", "Очистка дисков и арок", "Удаление битума и металлических вкраплений", "Сушка и защитный воск"],
            ["Белсенді көбікпен жанасусыз алдын ала жуу", "Екі шелек әдісімен қолмен жуу", "Дискілер мен доңғалақ қуыстарын тазалау", "Битум мен металл бөлшектерін кетіру", "Кептіру және қорғаныс балауызы"],
            ["Touchless snow-foam pre-wash", "Two-bucket hand wash", "Wheel and arch cleaning", "Tar and iron fallout removal", "Drying and protective wax"],
        ),
        benefits=t(
            ["Без новых царапин и голограмм", "Блеск и гидрофобный эффект", "Чистая основа для защиты кузова"],
            ["Жаңа сызаттар мен голограммаларсыз", "Жылтыр және гидрофобтық әсер", "Шанақты қорғауға таза негіз"],
            ["No new scratches or holograms", "Gloss and water beading", "A clean base for paint protection"],
        ),
        process=steps(
            ("Осмотр", "Оцениваем загрязнения и состояние ЛКП.", "Тексеру", "Ластану мен бояу күйін бағалаймыз.", "Inspection", "We assess contamination and paint condition."),
            ("Мойка", "Предмойка, ручная мойка, очистка дисков.", "Жуу", "Алдын ала жуу, қолмен жуу, дискілерді тазалау.", "Wash", "Pre-wash, hand wash, wheel cleaning."),
            ("Деконтаминация", "Убираем битум и металлические частицы.", "Деконтаминация", "Битум мен металл бөлшектерін кетіреміз.", "Decontamination", "We remove tar and iron particles."),
            ("Защита", "Сушим кузов и наносим воск.", "Қорғау", "Шанақты кептіріп, балауыз жағамыз.", "Protection", "We dry the car and apply wax."),
        ),
        options=[],
    ),
    dict(
        slug="paint-correction", category="exterior", featured=True, addon=False,
        price=120_000, minutes=600,
        name=t("Полировка кузова", "Шанақты жылтырату", "Paint correction"),
        summary=t(
            "Удаление царапин, голограмм и потёртостей, восстановление глубины цвета.",
            "Сызаттарды, голограммалар мен тозуларды кетіру, түс тереңдігін қалпына келтіру.",
            "Removal of swirls, holograms and light scratches; restores depth of colour.",
        ),
        description=t(
            "Машинная полировка в один, два или три этапа в зависимости от состояния лака. Перед работой замеряем толщину покрытия и честно говорим, какие дефекты можно убрать, а какие — нет.",
            "Лак күйіне қарай бір, екі немесе үш кезеңдік машиналық жылтырату. Жұмыс алдында жабын қалыңдығын өлшеп, қандай ақауларды жоюға болатынын ашық айтамыз.",
            "Machine polishing in one, two or three stages depending on the clear coat. We measure paint thickness first and tell you honestly which defects can and cannot be removed.",
        ),
        includes=t(
            ["Экстерьерная мойка и деконтаминация", "Замер толщины ЛКП", "Машинная полировка выбранной ступени", "Контроль при студийном освещении", "Защитный силант после полировки"],
            ["Сыртқы жуу және деконтаминация", "Бояу қалыңдығын өлшеу", "Таңдалған кезеңдегі машиналық жылтырату", "Студиялық жарықта тексеру", "Жылтыратудан кейін қорғаныс силанты"],
            ["Exterior wash and decontamination", "Paint thickness measurement", "Machine polishing of the chosen stage", "Inspection under studio lighting", "Protective sealant afterwards"],
        ),
        benefits=t(
            ["Глубокий зеркальный блеск", "Меньше видимых царапин и голограмм", "Идеальная база под керамику или плёнку"],
            ["Терең айналы жылтыр", "Көрінетін сызаттар мен голограммалар азаяды", "Керамика немесе пленка үшін мінсіз негіз"],
            ["Deep, mirror-like gloss", "Far fewer visible swirls and holograms", "Ideal base for ceramic coating or film"],
        ),
        process=steps(
            ("Диагностика", "Замер толщины и тестовый участок.", "Диагностика", "Қалыңдықты өлшеу және сынақ аймағы.", "Diagnostics", "Thickness readings and a test spot."),
            ("Подготовка", "Мойка, деконтаминация, оклейка уплотнителей.", "Дайындық", "Жуу, деконтаминация, тығыздағыштарды жабу.", "Preparation", "Wash, decontamination, masking of trims."),
            ("Полировка", "Абразивная и финишная стадии.", "Жылтырату", "Абразивті және соңғы кезеңдер.", "Polishing", "Cutting and finishing stages."),
            ("Контроль", "Проверка под разными источниками света.", "Бақылау", "Әртүрлі жарық көздерімен тексеру.", "Quality check", "Inspection under different light sources."),
        ),
        options=[
            ("one_step", "stage", True, 0, 0, t("Одноэтапная", "Бір кезеңдік", "One-step")),
            ("two_step", "stage", False, 60_000, 300, t("Двухэтапная", "Екі кезеңдік", "Two-step")),
            ("three_step", "stage", False, 110_000, 600, t("Трёхэтапная", "Үш кезеңдік", "Three-step")),
        ],
    ),
    dict(
        slug="ceramic-coating", category="protection", featured=True, addon=False,
        price=180_000, minutes=480,
        name=t("Керамическое покрытие", "Керамикалық жабын", "Ceramic coating"),
        summary=t(
            "Твёрдый защитный слой: блеск, гидрофобность и простота ухода.",
            "Қатты қорғаныс қабаты: жылтыр, гидрофобтылық және оңай күтім.",
            "A hard protective layer: gloss, water repellency and easy maintenance.",
        ),
        description=t(
            "Керамика наносится на подготовленный и отполированный кузов. Покрытие защищает лак от химии, ультрафиолета и мелких загрязнений и облегчает мойку. Срок службы зависит от количества слоёв и условий эксплуатации.",
            "Керамика дайындалған және жылтыратылған шанаққа жағылады. Жабын лакты химиядан, ультракүлгін сәулеленуден және ұсақ ластанудан қорғайды, жууды жеңілдетеді. Қызмет мерзімі қабат санына және пайдалану жағдайына байланысты.",
            "The coating is applied to a prepared, polished body. It protects the clear coat from chemicals, UV and light contamination and makes washing easier. Durability depends on the number of layers and driving conditions.",
        ),
        includes=t(
            ["Мойка и деконтаминация", "Одноэтапная полировка", "Обезжиривание кузова", "Нанесение выбранного количества слоёв", "Инфракрасная сушка и рекомендации по уходу"],
            ["Жуу және деконтаминация", "Бір кезеңдік жылтырату", "Шанақты майсыздандыру", "Таңдалған қабат санын жағу", "Инфрақызыл кептіру және күтім бойынша кеңестер"],
            ["Wash and decontamination", "One-step polish", "Panel wipe degreasing", "Chosen number of coating layers", "Infrared curing and aftercare advice"],
        ),
        benefits=t(
            ["Выраженный блеск и глубина цвета", "Вода и грязь хуже держатся на кузове", "Защита от реагентов и ультрафиолета"],
            ["Айқын жылтыр мен түс тереңдігі", "Су мен лай шанақта нашар ұсталады", "Реагенттер мен ультракүлгіннен қорғау"],
            ["Pronounced gloss and colour depth", "Water and dirt struggle to stick", "Protection against road salt and UV"],
        ),
        process=steps(
            ("Подготовка", "Мойка, деконтаминация, полировка.", "Дайындық", "Жуу, деконтаминация, жылтырату.", "Preparation", "Wash, decontamination, polishing."),
            ("Обезжиривание", "Удаляем остатки полировальных паст.", "Майсыздандыру", "Жылтырату пасталарының қалдықтарын кетіреміз.", "Degreasing", "We remove polishing oils."),
            ("Нанесение", "Слой за слоем с выдержкой.", "Жағу", "Қабат-қабатымен, үзіліспен.", "Application", "Layer by layer with flash time."),
            ("Полимеризация", "ИК-сушка и финальная проверка.", "Полимерлеу", "ИҚ кептіру және соңғы тексеру.", "Curing", "IR curing and final inspection."),
        ),
        options=[
            ("one_layer", "layers", True, 0, 0, t("1 слой", "1 қабат", "1 layer")),
            ("two_layers", "layers", False, 60_000, 240, t("2 слоя", "2 қабат", "2 layers")),
            ("three_layers", "layers", False, 110_000, 480, t("3 слоя", "3 қабат", "3 layers")),
            ("wheels", None, False, 40_000, 120, t("Керамика на диски", "Дискілерге керамика", "Wheel coating")),
            ("glass", None, False, 20_000, 60, t("Керамика на стёкла", "Әйнектерге керамика", "Glass coating")),
        ],
    ),
    dict(
        slug="ppf", category="protection", featured=True, addon=False,
        price=350_000, minutes=1440,
        name=t("Защитная плёнка PPF", "PPF қорғаныс пленкасы", "Paint protection film (PPF)"),
        summary=t(
            "Полиуретановая плёнка против сколов, царапин и пескоструя.",
            "Сынықтарға, сызаттарға және құмға қарсы полиуретан пленкасы.",
            "Polyurethane film against stone chips, scratches and sandblasting.",
        ),
        description=t(
            "Прозрачная полиуретановая плёнка физически защищает лакокрасочное покрытие. Оклеиваем зоны риска, переднюю часть или кузов целиком. Плёнку можно снять без вреда для заводского лака.",
            "Мөлдір полиуретан пленкасы бояуды физикалық тұрғыдан қорғайды. Қауіпті аймақтарды, алдыңғы бөлікті немесе бүкіл шанақты қаптаймыз. Пленканы зауыттық лакқа зиян келтірмей алып тастауға болады.",
            "A clear polyurethane film physically shields the paint. We cover high-risk areas, the full front or the whole body. The film can be removed without harming factory paint.",
        ),
        includes=t(
            ["Мойка и деконтаминация", "Подготовка поверхности", "Раскрой по лекалам или вручную", "Оклейка с заворотом кромок, где это возможно", "Контроль через 24 часа"],
            ["Жуу және деконтаминация", "Бетті дайындау", "Үлгі бойынша немесе қолмен пішу", "Мүмкін жерде шеттерін қайыра жапсыру", "24 сағаттан кейін тексеру"],
            ["Wash and decontamination", "Surface preparation", "Plotter-cut or hand-cut patterns", "Wrapped edges where possible", "Check-up after 24 hours"],
        ),
        benefits=t(
            ["Защита от сколов и песка", "Мелкие царапины на плёнке затягиваются при нагреве", "Сохранение заводского ЛКП"],
            ["Сынықтар мен құмнан қорғау", "Пленкадағы ұсақ сызаттар қызғанда жойылады", "Зауыттық бояуды сақтау"],
            ["Protection from chips and sand", "Light scratches in the film self-heal with heat", "Preserves factory paint"],
        ),
        process=steps(
            ("Консультация", "Выбираем зоны и тип плёнки.", "Кеңес", "Аймақтар мен пленка түрін таңдаймыз.", "Consultation", "We choose areas and film type."),
            ("Подготовка", "Мойка, деконтаминация, при необходимости полировка.", "Дайындық", "Жуу, деконтаминация, қажет болса жылтырату.", "Preparation", "Wash, decontamination, polishing if needed."),
            ("Оклейка", "Аккуратная установка деталей плёнки.", "Жапсыру", "Пленка бөліктерін мұқият орнату.", "Installation", "Careful fitting of each film panel."),
            ("Выдержка", "Контроль краёв и пузырей перед выдачей.", "Ұстау", "Беру алдында шеттер мен көпіршіктерді тексеру.", "Settling", "Edges and bubbles checked before handover."),
        ),
        options=[
            ("risk_zones", "coverage", True, 0, 0, t("Зоны риска", "Қауіпті аймақтар", "High-risk areas")),
            ("full_front", "coverage", False, 250_000, 720, t("Передняя часть целиком", "Алдыңғы бөлік толық", "Full front")),
            ("full_body", "coverage", False, 900_000, 2400, t("Весь кузов", "Бүкіл шанақ", "Full body")),
        ],
    ),
    dict(
        slug="interior-detailing", category="interior", featured=True, addon=True,
        price=45_000, minutes=240,
        name=t("Детейлинг салона", "Салон детейлингі", "Interior detailing"),
        summary=t(
            "Чистка и уход за пластиком, тканью, кожей и стёклами салона.",
            "Пластикті, матаны, теріні және салон әйнектерін тазалау әрі күту.",
            "Cleaning and care for plastics, fabric, leather and interior glass.",
        ),
        description=t(
            "Аккуратная уборка салона с подбором средств под каждый материал. Подходит для регулярного ухода и перед продажей автомобиля.",
            "Әр материалға сай құралдар таңдап, салонды мұқият тазалау. Тұрақты күтімге және көлікті сатар алдында қолайлы.",
            "Careful interior cleaning with products matched to each material. Good for regular care or before selling a car.",
        ),
        includes=t(
            ["Пылесос салона и багажника", "Очистка пластика и уплотнителей", "Чистка ковриков", "Стёкла изнутри", "Защитное средство для пластика"],
            ["Салон мен жүксалғышты шаңсорғышпен тазалау", "Пластик пен тығыздағыштарды тазалау", "Кілемшелерді тазалау", "Әйнектерді іштен тазалау", "Пластикке қорғаныс құралы"],
            ["Vacuuming of cabin and trunk", "Plastics and seals cleaning", "Floor mat cleaning", "Interior glass", "Protective dressing for plastics"],
        ),
        benefits=t(
            ["Свежий и аккуратный салон", "Средства, безопасные для материалов", "Защита пластика от выгорания"],
            ["Таза әрі ұқыпты салон", "Материалдарға қауіпсіз құралдар", "Пластикті күнге оңудан қорғау"],
            ["A fresh, tidy cabin", "Material-safe products", "Plastics protected from fading"],
        ),
        process=steps(
            ("Осмотр", "Определяем материалы и загрязнения.", "Тексеру", "Материалдар мен ластануды анықтаймыз.", "Inspection", "We identify materials and soiling."),
            ("Уборка", "Пылесос, продувка, сбор мусора.", "Тазалау", "Шаңсорғыш, үрлеу, қоқысты жинау.", "Cleaning", "Vacuum, air-blow, debris removal."),
            ("Уход", "Очистка и защита поверхностей.", "Күтім", "Беттерді тазалау және қорғау.", "Care", "Cleaning and protecting surfaces."),
        ),
        options=[
            ("leather_care", None, False, 20_000, 60, t("Чистка и пропитка кожи", "Теріні тазалау және сіңдіру", "Leather cleaning & conditioning")),
            ("ozone", None, False, 10_000, 30, t("Озонирование", "Озондау", "Ozone treatment")),
        ],
    ),
    dict(
        slug="deep-interior-cleaning", category="interior", featured=False, addon=False,
        price=70_000, minutes=360,
        name=t("Глубокая химчистка салона", "Салонды терең химиялық тазалау", "Deep interior cleaning"),
        summary=t(
            "Экстракторная чистка сидений, ковров и обивки с сушкой.",
            "Орындықтарды, кілемдерді және қаптаманы экстракторлық тазалау мен кептіру.",
            "Extraction cleaning of seats, carpets and upholstery, with drying.",
        ),
        description=t(
            "Для сильных загрязнений и неприятных запахов: очищаем ткань и ковровое покрытие на глубину волокон и тщательно сушим салон.",
            "Қатты ластану мен жағымсыз иістерге арналған: мата мен кілем жабынын талшық тереңдігіне дейін тазалап, салонды мұқият кептіреміз.",
            "For heavy soiling and odours: we clean fabric and carpet deep into the fibres and dry the cabin thoroughly.",
        ),
        includes=t(
            ["Всё из детейлинга салона", "Экстракторная чистка сидений", "Чистка ковров и обивки дверей", "Сушка салона"],
            ["Салон детейлингіндегі барлық жұмыс", "Орындықтарды экстракторлық тазалау", "Кілемдер мен есік қаптамасын тазалау", "Салонды кептіру"],
            ["Everything from interior detailing", "Seat extraction cleaning", "Carpet and door card cleaning", "Cabin drying"],
        ),
        benefits=t(
            ["Удаление глубоких загрязнений", "Нейтрализация запахов", "Салон высыхает до выдачи"],
            ["Терең ластануды кетіру", "Иістерді бейтараптандыру", "Салон беру алдында құрғайды"],
            ["Removes deep-set dirt", "Neutralises odours", "Cabin is dry at handover"],
        ),
        process=steps(
            ("Подготовка", "Сухая уборка и тест средств.", "Дайындық", "Құрғақ тазалау және құралдарды сынау.", "Preparation", "Dry clean-up and product testing."),
            ("Химчистка", "Обработка и экстракция.", "Химиялық тазалау", "Өңдеу және экстракция.", "Deep cleaning", "Treatment and extraction."),
            ("Сушка", "Сушим салон до выдачи.", "Кептіру", "Салонды беру алдында кептіреміз.", "Drying", "The cabin is dried before handover."),
        ),
        options=[
            ("headliner", None, False, 15_000, 60, t("Чистка потолка", "Төбені тазалау", "Headliner cleaning")),
            ("ozone", None, False, 10_000, 30, t("Озонирование", "Озондау", "Ozone treatment")),
        ],
    ),
    dict(
        slug="window-tinting", category="glass-optics", featured=False, addon=True,
        price=35_000, minutes=180,
        name=t("Тонировка стёкол", "Әйнектерді түңілту", "Window tinting"),
        summary=t(
            "Тонировка задней полусферы плёнкой с защитой от ультрафиолета.",
            "Ультракүлгіннен қорғайтын пленкамен артқы жартышарды түңілту.",
            "Rear window tinting with UV-blocking film.",
        ),
        description=t(
            "Оклеиваем заднюю полусферу автомобиля. Работы выполняются в рамках требований законодательства Республики Казахстан к светопропусканию стёкол.",
            "Көліктің артқы жартышарын қаптаймыз. Жұмыстар Қазақстан Республикасы заңнамасының әйнек өткізгіштігіне қойылатын талаптары шегінде орындалады.",
            "We tint the rear windows. Work follows Kazakhstan's legal requirements for window light transmission.",
        ),
        includes=t(
            ["Подбор плёнки", "Демонтаж обшивок при необходимости", "Оклейка задней полусферы", "Контроль и рекомендации"],
            ["Пленканы таңдау", "Қажет болса қаптаманы бөлшектеу", "Артқы жартышарды қаптау", "Тексеру және кеңестер"],
            ["Film selection", "Trim removal when needed", "Rear windows tinting", "Check and aftercare advice"],
        ),
        benefits=t(
            ["Меньше нагрев салона", "Защита от ультрафиолета", "Приватность для пассажиров"],
            ["Салон аз қызады", "Ультракүлгіннен қорғау", "Жолаушылар үшін жекелік"],
            ["Less cabin heat", "UV protection", "Privacy for passengers"],
        ),
        process=steps(
            ("Выбор плёнки", "Подбираем оттенок и тип.", "Пленка таңдау", "Реңк пен түрін таңдаймыз.", "Film choice", "We pick the shade and type."),
            ("Подготовка", "Очистка стёкол.", "Дайындық", "Әйнектерді тазалау.", "Preparation", "Glass cleaning."),
            ("Оклейка", "Установка и выгонка плёнки.", "Жапсыру", "Пленканы орнату және тегістеу.", "Installation", "Fitting and squeegeeing the film."),
        ),
        options=[
            ("premium_film", None, False, 20_000, 0, t("Премиальная плёнка", "Премиум пленка", "Premium film")),
        ],
    ),
    dict(
        slug="headlight-restoration", category="glass-optics", featured=False, addon=True,
        price=25_000, minutes=90, display="fixed",
        name=t("Восстановление фар", "Шамдарды қалпына келтіру", "Headlight restoration"),
        summary=t(
            "Шлифовка и полировка помутневших фар с защитным покрытием.",
            "Күңгірттенген шамдарды тегістеу, жылтырату және қорғаныс жабыны.",
            "Sanding and polishing of hazy headlights with a protective coat.",
        ),
        description=t(
            "Убираем помутнение и желтизну с пластиковых фар, возвращаем прозрачность и наносим защиту, чтобы эффект держался дольше.",
            "Пластик шамдардан күңгірттік пен сарғыштықты кетіріп, мөлдірлігін қайтарамыз және әсер ұзақ сақталуы үшін қорғаныс жағамыз.",
            "We remove haze and yellowing from plastic headlights, restore clarity and add protection so the result lasts longer.",
        ),
        includes=t(
            ["Оклейка кузова вокруг фар", "Многоступенчатая шлифовка", "Полировка", "Защитное покрытие"],
            ["Шам айналасындағы шанақты жабу", "Көпсатылы тегістеу", "Жылтырату", "Қорғаныс жабыны"],
            ["Masking around the lights", "Multi-stage sanding", "Polishing", "Protective coat"],
        ),
        benefits=t(
            ["Лучше светят ночью", "Ухоженный внешний вид", "Дешевле замены фар"],
            ["Түнде жақсы жарықтандырады", "Ұқыпты сыртқы көрініс", "Шамдарды ауыстырудан арзан"],
            ["Better light output at night", "A cared-for look", "Cheaper than replacement"],
        ),
        process=steps(
            ("Шлифовка", "Снимаем повреждённый слой.", "Тегістеу", "Зақымдалған қабатты аламыз.", "Sanding", "We remove the damaged layer."),
            ("Полировка", "Возвращаем прозрачность.", "Жылтырату", "Мөлдірлікті қайтарамыз.", "Polishing", "We restore clarity."),
            ("Защита", "Наносим покрытие.", "Қорғау", "Жабын жағамыз.", "Protection", "We apply a coating."),
        ),
        options=[
            ("ppf_headlights", None, False, 15_000, 30, t("Плёнка на фары", "Шамдарға пленка", "Headlight film")),
        ],
    ),
]  # fmt: skip

SITE = SiteSettings(
    business_name="AutoPoint",
    is_demo=True,
    phone="+77000000000",
    whatsapp="+77000000000",
    telegram="autopoint_demo",
    email="hello@example.com",
    address_i18n=t("Демо-адрес, Астана", "Демо-мекенжай, Астана", "Demo address, Astana"),
    city_i18n=t("Астана", "Астана", "Astana"),
    latitude=51.1282,
    longitude=71.4304,
    map_links=[
        {"provider": "2gis", "url": "https://2gis.kz/astana?m=71.4304%2C51.1282%2F16"},
        {"provider": "yandex", "url": "https://yandex.kz/maps/?pt=71.4304,51.1282&z=16&l=map"},
        {"provider": "google", "url": "https://www.google.com/maps/search/?api=1&query=51.1282,71.4304"},
    ],
    seo_title_i18n=t(
        "AutoPoint — детейлинг-студия в Астане",
        "AutoPoint — Астанадағы детейлинг студиясы",
        "AutoPoint — detailing studio in Astana",
    ),
    seo_description_i18n=t(
        "Полировка, керамика, защитная плёнка PPF, химчистка и детейлинг салона в Астане. Онлайн-запись и прозрачные цены.",
        "Астанада жылтырату, керамика, PPF пленкасы, химиялық тазалау және салон детейлингі. Онлайн жазылу және ашық бағалар.",
        "Paint correction, ceramic coating, PPF, interior cleaning and detailing in Astana. Online booking and transparent prices.",
    ),
)  # fmt: skip

HOURS = [(d, time(9), time(20)) for d in range(1, 7)] + [(7, time(10), time(18))]

TEAM = [
    ("Ерлан С.", t("Ведущий мастер детейлинга", "Жетекші детейлинг шебері", "Lead detailer"), t("Полировка и керамические покрытия.", "Жылтырату және керамикалық жабындар.", "Paint correction and ceramic coatings.")),
    ("Дмитрий К.", t("Специалист по защитной плёнке", "Қорғаныс пленкасы маманы", "PPF specialist"), t("Оклейка PPF и тонировка.", "PPF жапсыру және түңілту.", "PPF installation and window tint.")),
    ("Асель Н.", t("Администратор студии", "Студия әкімшісі", "Studio manager"), t("Запись, консультации и приём автомобилей.", "Жазылу, кеңес беру және көліктерді қабылдау.", "Bookings, consultations and vehicle check-in.")),
]  # fmt: skip

REVIEWS = [
    ("Айдос", "Toyota Camry", 5, "ru", date(2026, 10, 2), "Делали полировку и керамику. Заранее объяснили, что реально исправить, а что нет, — результат совпал с обещанным."),
    ("Мария", "Kia Sportage", 5, "ru", date(2026, 9, 18), "Химчистка салона после зимы: всё аккуратно, машину отдали в назначенное время."),
    ("Daniel", "Lexus RX", 4, "en", date(2026, 8, 27), "Clear pricing up front and the car was ready on time. Booking online was easy."),
]  # fmt: skip

# (kind, service slug, alt)
GALLERY = [
    ("before_after", "paint-correction", t("Полировка капота: до и после", "Капотты жылтырату: дейін және кейін", "Bonnet paint correction: before and after")),
    ("before_after", "headlight-restoration", t("Восстановление фары: до и после", "Шамды қалпына келтіру: дейін және кейін", "Headlight restoration: before and after")),
    ("before_after", "deep-interior-cleaning", t("Химчистка сиденья: до и после", "Орындықты химиялық тазалау: дейін және кейін", "Seat deep cleaning: before and after")),
    ("work", "ceramic-coating", t("Кузов после нанесения керамики", "Керамика жағылғаннан кейінгі шанақ", "Paint after ceramic coating")),
    ("work", "ppf", t("Оклейка передней части плёнкой", "Алдыңғы бөлікті пленкамен қаптау", "Front-end PPF installation")),
    ("work", "interior-detailing", t("Салон после детейлинга", "Детейлингтен кейінгі салон", "Cabin after interior detailing")),
]  # fmt: skip


def _round(value: float, step: int) -> int:
    return int(round(value / step) * step)


def seed(session: Session) -> bool:
    """Insert whatever demo data is missing. Each part checks for itself, so a database
    seeded by an earlier version only gets the new parts. Returns True if anything was added."""
    added = [seed_site_and_catalog(session), seed_scheduling(session), seed_discounts(session)]
    return any(added)


def seed_site_and_catalog(session: Session) -> bool:
    if session.get(BusinessSettings, 1) is not None:
        return False

    session.add(BusinessSettings(id=1, data=SITE.model_dump(mode="json")))
    session.add_all(BusinessHours(weekday=d, opens=o, closes=c) for d, o, c in HOURS)

    vehicles = []
    for i, (code, name, examples, pf, df) in enumerate(VEHICLES):
        v = VehicleCategory(code=code, name_i18n=name, examples_i18n=examples, sort_order=i)
        vehicles.append((v, pf, df))
        session.add(v)

    categories = {}
    for i, (slug, name) in enumerate(CATEGORIES):
        categories[slug] = ServiceCategory(slug=slug, name_i18n=name, sort_order=i)
        session.add(categories[slug])
    session.flush()

    services = {}
    for i, data in enumerate(SERVICES):
        service = Service(
            category_id=categories[data["category"]].id,
            slug=data["slug"],
            name_i18n=data["name"],
            summary_i18n=data["summary"],
            description_i18n=data["description"],
            includes_i18n=data["includes"],
            benefits_i18n=data["benefits"],
            process_i18n=data["process"],
            price_display=data.get("display", "from"),
            addon_eligible=data["addon"],
            is_featured=data["featured"],
            sort_order=i,
        )
        session.add(service)
        session.flush()
        services[service.slug] = service

        def prices(option_id, price, minutes, service=service):
            for v, pf, df in vehicles:
                session.add(
                    PriceEntry(
                        service_id=service.id,
                        option_id=option_id,
                        vehicle_category_id=v.id,
                        price_kzt=_round(price * pf, 1000),
                        duration_min=_round(minutes * df, 15),
                    )
                )

        prices(None, data["price"], data["minutes"])
        for j, (code, group, default, price, minutes, name) in enumerate(data["options"]):
            option = ServiceOption(
                service_id=service.id,
                code=code,
                group_code=group,
                is_default=default,
                name_i18n=name,
                sort_order=j,
            )
            session.add(option)
            session.flush()
            prices(option.id, price, minutes)

    for i, (kind, slug, alt) in enumerate(GALLERY):
        session.add(
            GalleryImage(
                kind=kind,
                service_id=services[slug].id,
                category_id=services[slug].category_id,
                alt_i18n=alt,
                is_published=True,
                is_demo=True,  # no photo yet: the site renders a labelled illustration
                sort_order=i,
            )
        )

    for i, (name, position, bio) in enumerate(TEAM):
        session.add(
            Employee(
                display_name=name,
                position_i18n=position,
                bio_i18n=bio,
                is_public=True,
                is_demo=True,
                sort_order=i,
            )
        )

    for author, vehicle, rating, locale, day, body in REVIEWS:
        session.add(
            Review(
                author_name=author,
                vehicle=vehicle,
                rating=rating,
                locale=locale,
                body=body,
                review_date=day,
                is_published=True,
                is_demo=True,
            )
        )
    session.flush()
    return True


# Who can do what, and when (business-local time). Asel is the studio manager: not bookable.
SKILLS = {
    "Ерлан С.": [
        "exterior-detailing",
        "paint-correction",
        "ceramic-coating",
        "interior-detailing",
        "deep-interior-cleaning",
        "headlight-restoration",
    ],
    "Дмитрий К.": [
        "ppf",
        "window-tinting",
        "headlight-restoration",
        "exterior-detailing",
        "ceramic-coating",
    ],
}
WEEKLY = {
    "Ерлан С.": [(d, time(9), time(18)) for d in range(1, 6)],  # Mon–Fri
    "Дмитрий К.": [(d, time(10), time(19)) for d in range(2, 7)],  # Tue–Sat
}


def seed_scheduling(session: Session) -> bool:
    if session.scalar(select(EmployeeService.employee_id).limit(1)) is not None:
        return False
    employees = {e.display_name: e for e in session.scalars(select(Employee))}
    services = {s.slug: s.id for s in session.scalars(select(Service))}
    for name, employee in employees.items():
        employee.is_bookable = name in SKILLS
    for name, slugs in SKILLS.items():
        session.add_all(
            EmployeeService(employee_id=employees[name].id, service_id=services[slug])
            for slug in slugs
        )
        session.add_all(
            EmployeeSchedule(
                employee_id=employees[name].id, weekday=d, starts_local=a, ends_local=b
            )
            for d, a, b in WEEKLY[name]
        )
    session.flush()
    return True


def seed_discounts(session: Session) -> bool:
    if session.scalar(select(DiscountRule.id).limit(1)) is not None:
        return False
    services = {s.slug: s.id for s in session.scalars(select(Service))}
    bundle = DiscountRule(
        kind="bundle",
        name_i18n=t("Кузов + салон", "Шанақ + салон", "Exterior + interior"),
        percent=10,
    )
    session.add(bundle)
    session.flush()
    session.add_all(
        DiscountRuleService(rule_id=bundle.id, service_id=services[slug])
        for slug in ("exterior-detailing", "interior-detailing")
    )
    session.add(
        DiscountRule(
            kind="min_services",
            name_i18n=t("Комплекс из 3 услуг", "3 қызмет кешені", "Package of 3 services"),
            percent=5,
            min_services=3,
        )
    )
    session.flush()
    return True


# Demo staff accounts for development and portfolio demos ONLY: the password is public
# (it is in this file and the README). They are never created when ENVIRONMENT=production.
DEMO_PASSWORD = "autopoint-demo-2026"  # noqa: S105 - documented demo credential
DEMO_USERS = [
    ("owner@autopoint.demo", "Демо Владелец", "owner"),
    ("admin@autopoint.demo", "Демо Админ", "admin"),
    ("manager@autopoint.demo", "Асель Н.", "manager"),
    ("erlan@autopoint.demo", "Ерлан С.", "employee"),  # linked to the master «Ерлан С.»
]


def seed_demo_users(session: Session) -> bool:
    from app.config import get_settings
    from app.modules.auth.models import User
    from app.modules.auth.security import hash_password

    if get_settings().environment == "production":
        logger.warning("Demo users skipped: ENVIRONMENT=production")
        return False
    if session.scalar(select(User.id).limit(1)) is not None:
        return False
    password_hash = hash_password(DEMO_PASSWORD)
    users = {
        email: User(email=email, full_name=name, role=role, password_hash=password_hash)
        for email, name, role in DEMO_USERS
    }
    session.add_all(users.values())
    session.flush()
    erlan = session.scalar(select(Employee).where(Employee.display_name == "Ерлан С."))
    if erlan is not None:
        erlan.user_id = users["erlan@autopoint.demo"].id
    session.flush()
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal.begin() as session:
        created = seed(session)
        users = seed_demo_users(session)
    logger.info("Demo data %s", "added" if created else "skipped: already present")
    if users:
        logger.info("Demo staff accounts created (password: see README, development only)")


if __name__ == "__main__":
    main()
