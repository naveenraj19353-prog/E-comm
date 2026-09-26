import unittest
from datetime import date, datetime, timezone

from app.services.sales_report import (
    ReportRangeError,
    build_report,
    default_group,
    period_keys,
    resolve_range,
    series_pipeline,
    tz_string,
)


class RangeTests(unittest.TestCase):
    def test_tz_string(self):
        self.assertEqual(tz_string(330), "+05:30")
        self.assertEqual(tz_string(0), "+00:00")
        self.assertEqual(tz_string(-300), "-05:00")
        with self.assertRaises(ReportRangeError):
            tz_string(2000)

    def test_default_is_last_30_days_in_local_time(self):
        start, end, first, last = resolve_range(None, None, 330, today=date(2026, 9, 24))
        self.assertEqual((first, last), (date(2026, 8, 26), date(2026, 9, 24)))
        self.assertEqual(start, datetime(2026, 8, 25, 18, 30, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 9, 24, 18, 30, tzinfo=timezone.utc))

    def test_bad_ranges(self):
        for args in [("2026-09-24", "2026-09-01"), ("24-09-2026", None), ("2024-01-01", "2026-01-01")]:
            with self.assertRaises(ReportRangeError):
                resolve_range(*args, 330)

    def test_default_group(self):
        self.assertEqual(default_group(date(2026, 9, 1), date(2026, 9, 30)), "day")
        self.assertEqual(default_group(date(2026, 6, 1), date(2026, 9, 30)), "week")
        self.assertEqual(default_group(date(2026, 1, 1), date(2026, 9, 30)), "month")


class PeriodTests(unittest.TestCase):
    def test_days(self):
        self.assertEqual(period_keys(date(2026, 9, 29), date(2026, 10, 1), "day"), ["2026-09-29", "2026-09-30", "2026-10-01"])

    def test_weeks_start_monday(self):
        self.assertEqual(period_keys(date(2026, 9, 24), date(2026, 10, 1), "week"), ["2026-09-21", "2026-09-28"])

    def test_months(self):
        self.assertEqual(period_keys(date(2026, 11, 15), date(2027, 1, 3), "month"), ["2026-11-01", "2026-12-01", "2027-01-01"])

    def test_week_pipeline_starts_monday(self):
        start = datetime(2026, 9, 1, tzinfo=timezone.utc)
        group = series_pipeline("s", start, start, "week", "+05:30")[1]["$group"]["_id"]
        trunc = group["$dateToString"]["date"]["$dateTrunc"]
        self.assertEqual((trunc["unit"], trunc["startOfWeek"], trunc["timezone"]), ("week", "monday", "+05:30"))


class BuildReportTests(unittest.TestCase):
    def test_totals_fill_gaps_and_aov(self):
        report = build_report(
            summary_rows=[{"placed": 5, "cancelled": 1, "netSales": 4000.004, "refunded": 200}],
            series_rows=[{"_id": "2026-09-02", "orders": 4, "netSales": 4000}],
            status_rows=[{"_id": "delivered", "count": 3}, {"_id": "cancelled", "count": 1}],
            top_rows=[{"_id": "p1", "name": "Tee", "units": 6, "sales": 3000}],
            first=date(2026, 9, 1),
            last=date(2026, 9, 3),
            unit="day",
        )
        self.assertEqual(report["totals"]["orders"], 4)
        self.assertEqual(report["totals"]["averageOrderValue"], 1000.0)
        self.assertEqual([p["orders"] for p in report["series"]], [0, 4, 0])
        self.assertEqual(report["statusCounts"]["cancelled"], 1)
        self.assertEqual(report["topProducts"][0]["units"], 6)

    def test_empty_store(self):
        report = build_report(
            summary_rows=[], series_rows=[], status_rows=[], top_rows=[],
            first=date(2026, 9, 1), last=date(2026, 9, 1), unit="day",
        )
        self.assertEqual(report["totals"]["averageOrderValue"], 0.0)
        self.assertEqual(
            report["series"],
            [
                {
                    "period": "2026-09-01",
                    "orders": 0,
                    "netSales": 0.0,
                    # Additive: a store with no tax block reports no tax.
                    "taxCollected": 0.0,
                }
            ],
        )

    def test_tax_is_reported_separately_from_sales(self):
        # netSales stays what customers paid; the tax split rides alongside so
        # revenue can be read net of GST without moving the money figures.
        report = build_report(
            summary_rows=[
                {
                    "placed": 1,
                    "cancelled": 0,
                    "netSales": 39990.0,
                    "refunded": 0,
                    "taxCollected": 6100.17,
                    "taxableSales": 33889.83,
                }
            ],
            series_rows=[],
            status_rows=[],
            top_rows=[
                {
                    "_id": "p1",
                    "name": "Frame",
                    "units": 1,
                    "sales": 39990.0,
                    "tax": 6100.17,
                }
            ],
            first=date(2026, 9, 1),
            last=date(2026, 9, 1),
            unit="day",
        )

        self.assertEqual(report["totals"]["netSales"], 39990.0)
        self.assertEqual(report["totals"]["taxCollected"], 6100.17)
        self.assertEqual(report["totals"]["taxableSales"], 33889.83)
        self.assertEqual(report["topProducts"][0]["tax"], 6100.17)

    def test_missing_tax_fields_default_to_zero(self):
        # Orders placed before tax existed carry no tax block at all.
        report = build_report(
            summary_rows=[{"placed": 1, "cancelled": 0, "netSales": 500.0}],
            series_rows=[{"_id": "2026-09-01", "orders": 1, "netSales": 500.0}],
            status_rows=[],
            top_rows=[{"_id": "p1", "name": "Tee", "units": 1, "sales": 500.0}],
            first=date(2026, 9, 1),
            last=date(2026, 9, 1),
            unit="day",
        )

        self.assertEqual(report["totals"]["taxCollected"], 0.0)
        self.assertEqual(report["totals"]["taxableSales"], 0.0)
        self.assertEqual(report["series"][0]["taxCollected"], 0.0)
        self.assertEqual(report["topProducts"][0]["tax"], 0.0)


if __name__ == "__main__":
    unittest.main()
