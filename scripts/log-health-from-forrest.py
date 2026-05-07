#!/usr/bin/env python3
"""Bridge forrest's canonical HealthKit ledgers into ~/.health_log.jsonl.

This replaces the stale legacy Pi /api/health/dashboard feed for Home23's
health channel while preserving the existing log/status schema consumed by
Jerry's engine.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
LOG_PATH = Path(os.environ.get('HEALTH_LOG_PATH', str(HOME / '.health_log.jsonl')))
STATUS_PATH = Path(os.environ.get('HEALTH_STATUS_PATH', str(HOME / '.health_log.status.json')))
BASE = Path('/Users/jtr/_JTR23_/release/home23/instances/forrest/workspace/health_jtr')
DAILY = BASE / 'ledgers' / 'daily_metrics.jsonl'
SLEEP = BASE / 'ledgers' / 'sleep.jsonl'
MAX_DATA_AGE_DAYS = int(os.environ.get('HEALTH_MAX_DATA_AGE_DAYS', '3'))

ALIASES = {
    'heart_rate_variability': 'heartRateVariability',
    'resting_heart_rate': 'restingHeartRate',
    'vo2_max': 'vo2Max',
    'weight': 'weight',
    'body_fat_percentage': 'bodyFat',
    'body_mass_index': 'bmi',
    'lean_body_mass': 'leanBodyMass',
    'apple_sleeping_wrist_temperature': 'wristTemperature',
    'respiratory_rate': 'respiratoryRate',
    'blood_oxygen_saturation': 'oxygenSaturation',
    'active_energy': 'activeCalories',
    'basal_energy_burned': 'basalCalories',
    'step_count': 'stepCount',
    'flights_climbed': 'flightsClimbed',
    'walking_heart_rate_average': 'walkingHeartRate',
    'apple_exercise_time': 'exerciseMinutes',
}


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def read_jsonl(path):
    if not path.exists():
        return []
    rows = []
    with path.open('r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return rows


def parse_day(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except Exception:
        return None


def write_status(status):
    STATUS_PATH.write_text(json.dumps(status) + '\n', encoding='utf-8')


def fail(reason, code=1, extra=None):
    ts = now_iso()
    status = {
        'checkedAt': ts,
        'ok': False,
        'stale': True,
        'apiUrl': 'forrest-ledgers',
        'reason': reason,
    }
    if extra:
        status.update(extra)
    write_status(status)
    print(reason, file=sys.stderr)
    return code


def main():
    ts = now_iso()
    if not DAILY.exists():
        return fail('forrest daily_metrics ledger missing')

    latest = {}
    for r in read_jsonl(DAILY):
        alias = ALIASES.get(r.get('metric'))
        date = r.get('date')
        if not alias or not date or r.get('qty') is None:
            continue
        key = (alias, date)
        prev = latest.get(key)
        if prev is None or str(r.get('ingested_at', '')) > str(prev.get('ingested_at', '')):
            latest[key] = r

    metrics = {}
    metric_dates = {}
    newest = None
    for (alias, date), r in latest.items():
        value = r.get('qty')
        unit = r.get('units') or ''
        if alias == 'weight' and unit == 'kg':
            value = value * 2.20462
            unit = 'lb'
        if alias == 'wristTemperature' and unit == 'degC':
            value = value * 9 / 5 + 32
            unit = '°F'
        current = metrics.get(alias)
        if current is None or str(date) > str(current.get('date', '')):
            metrics[alias] = {'date': date, 'value': value, 'unit': unit}
            metric_dates[alias] = date
        day = parse_day(date)
        if day and (newest is None or day > newest):
            newest = day

    # Merge sleep as legacy sleepTime minutes. Pick latest sleep date.
    latest_sleep = None
    for s in read_jsonl(SLEEP):
        date = s.get('date')
        total = s.get('total_hrs') or s.get('asleep_hrs')
        if not date or not total:
            continue
        if latest_sleep is None or str(date) > str(latest_sleep.get('date', '')):
            latest_sleep = s
    if latest_sleep:
        date = latest_sleep.get('date')
        total = float(latest_sleep.get('total_hrs') or latest_sleep.get('asleep_hrs') or 0)
        metrics['sleepTime'] = {'date': date, 'value': total * 60, 'unit': 'min'}
        metric_dates['sleepTime'] = date
        day = parse_day(date)
        if day and (newest is None or day > newest):
            newest = day

    today = datetime.now(timezone.utc).date()
    data_age_days = (today - newest).days if newest else None
    stale = data_age_days is None or data_age_days > MAX_DATA_AGE_DAYS

    status = {
        'checkedAt': ts,
        'ok': not stale,
        'stale': stale,
        'apiUrl': 'forrest-ledgers',
        'exportEndDate': newest.isoformat() if newest else None,
        'newestMetricDate': newest.isoformat() if newest else None,
        'dataAgeDays': data_age_days,
        'maxDataAgeDays': MAX_DATA_AGE_DAYS,
        'metricCount': len(metrics),
        'reason': 'fresh health data from forrest ledgers' if not stale else 'forrest health ledger is semantically stale',
        'source': str(DAILY),
    }
    write_status(status)

    if stale:
        print(f"health payload stale; newest metric date {status['newestMetricDate'] or 'unknown'}", file=sys.stderr)
        return 2

    entry = {
        'ts': ts,
        'export_info': {
            'source': 'forrest-healthkit-ledgers',
            'endDate': newest.isoformat() if newest else None,
            'exportDate': ts,
        },
        'metrics': metrics,
        'metric_dates': metric_dates,
        'health_data_end_date': newest.isoformat() if newest else None,
        'health_data_age_days': data_age_days,
        'semantic_stale': False,
    }
    with LOG_PATH.open('a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
