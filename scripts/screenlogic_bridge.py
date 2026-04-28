#!/usr/bin/env python3
"""Home23 ScreenLogic bridge.

Read-only local HTTP facade for Pentair ScreenLogic. The bridge keeps the
GPL screenlogicpy dependency out of the MIT Home23 code path by using it only
as an optional runtime dependency.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int, min_value: int | None = None) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        value = default
    if min_value is not None:
        return max(min_value, value)
    return value


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(val) for key, val in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def first_value(source: Any, names: tuple[str, ...]) -> Any:
    if isinstance(source, dict):
        for name in names:
            if name in source and source[name] not in (None, ""):
                return source[name]
        for value in source.values():
            found = first_value(value, names)
            if found not in (None, ""):
                return found
    elif isinstance(source, list):
        for item in source:
            found = first_value(item, names)
            if found not in (None, ""):
                return found
    return None


def display_value(value: Any) -> Any:
    if isinstance(value, dict):
        raw_value = value.get("value")
        enum_options = value.get("enum_options")
        if isinstance(enum_options, list) and isinstance(raw_value, int) and 0 <= raw_value < len(enum_options):
            return enum_options[raw_value]
        if raw_value is not None:
            return raw_value
    return value


def first_display_value(source: Any, names: tuple[str, ...]) -> Any:
    return display_value(first_value(source, names))


def normalize_body(raw: Any, body_name: str) -> dict[str, Any]:
    body_lower = body_name.lower()
    candidates: list[Any] = []

    if isinstance(raw, dict):
        direct = raw.get(body_lower) or raw.get(body_name) or raw.get(body_name.capitalize())
        if direct is not None:
            candidates.append(direct)
        bodies = raw.get("bodies") or raw.get("body") or raw.get("temperatures")
        if isinstance(bodies, dict):
            direct = bodies.get(body_lower) or bodies.get(body_name) or bodies.get(body_name.capitalize())
            if direct is not None:
                candidates.append(direct)
            for item in bodies.values():
                if not isinstance(item, dict):
                    continue
                label = str(item.get("name") or item.get("body") or item.get("label") or "").lower()
                if body_lower in label:
                    candidates.append(item)
        elif isinstance(bodies, list):
            for item in bodies:
                if not isinstance(item, dict):
                    continue
                label = str(item.get("name") or item.get("body") or item.get("label") or "").lower()
                if body_lower in label:
                    candidates.append(item)

    source = candidates[0] if candidates else raw
    prefix = body_lower

    return {
        "temperature": first_display_value(source, (
            "last_temperature",
            "current_temperature",
            "currentTemp",
            "current_temp",
            "temperature",
            "temp",
            f"{prefix}_temperature",
            f"{prefix}Temp",
        )),
        "heatSetPoint": first_display_value(source, (
            "heat_set_point",
            "heat_setpoint",
            "heatSetPoint",
            "heat_temp",
            "target_temperature",
            "targetTemp",
            "setpoint",
            f"{prefix}_heat_set_point",
            f"{prefix}HeatSetPoint",
        )),
        "heatMode": first_display_value(source, (
            "heat_mode",
            "heatMode",
            "mode",
            f"{prefix}_heat_mode",
            f"{prefix}HeatMode",
        )),
        "heatState": first_display_value(source, (
            "heat_state",
            "heatState",
            "heater",
            "heat",
            f"{prefix}_heat_state",
            f"{prefix}HeatState",
        )),
    }


def normalize_circuits(raw: Any) -> list[dict[str, Any]]:
    circuits = None
    if isinstance(raw, dict):
        circuits = raw.get("circuits") or raw.get("circuit")
    if circuits is None:
        return []

    normalized = []
    if isinstance(circuits, dict):
        iterable = circuits.items()
        for circuit_id, circuit in iterable:
            if isinstance(circuit, dict):
                normalized.append({
                    "id": circuit.get("id", circuit_id),
                    "name": circuit.get("name") or circuit.get("label") or str(circuit_id),
                    "state": display_value(
                        circuit.get("state")
                        if circuit.get("state") is not None
                        else circuit.get("status")
                        if circuit.get("status") is not None
                        else circuit.get("value")
                    ),
                })
            else:
                normalized.append({"id": circuit_id, "name": str(circuit_id), "state": circuit})
    elif isinstance(circuits, list):
        for circuit in circuits:
            if isinstance(circuit, dict):
                normalized.append({
                    "id": circuit.get("id") or circuit.get("circuit_id") or circuit.get("number"),
                    "name": circuit.get("name") or circuit.get("label") or "Circuit",
                    "state": display_value(
                        circuit.get("state")
                        if circuit.get("state") is not None
                        else circuit.get("status")
                        if circuit.get("status") is not None
                        else circuit.get("value")
                    ),
                })

    return normalized


def active_circuit_names(circuits: list[dict[str, Any]]) -> list[str]:
    active = []
    for circuit in circuits:
        state = circuit.get("state")
        if state is True or state == 1 or str(state).lower() in {"1", "on", "true"}:
            active.append(str(circuit.get("name") or circuit.get("id") or "Circuit"))
    return active


def normalize_status(raw: Any, connected: bool, bridge_status: str, error: str | None) -> dict[str, Any]:
    pool = normalize_body(raw, "pool")
    spa = normalize_body(raw, "spa")
    circuits = normalize_circuits(raw)
    active = active_circuit_names(circuits)

    summary_bits = []
    if pool.get("temperature") is not None:
        summary_bits.append(f"Pool {pool['temperature']}F")
    if spa.get("temperature") is not None:
        summary_bits.append(f"Spa {spa['temperature']}F")
    if active:
        summary_bits.append(f"{len(active)} circuit{'s' if len(active) != 1 else ''} on")
    if not summary_bits:
        summary_bits.append("Waiting for ScreenLogic data" if not connected else "Connected")

    return {
        "ok": connected and not error,
        "status": bridge_status,
        "connected": connected,
        "summary": " · ".join(summary_bits),
        "pool": pool,
        "spa": spa,
        "circuits": circuits,
        "activeCircuits": active,
        "activeCircuitsText": ", ".join(active) if active else "None",
        "chemistry": first_value(raw, ("chemistry", "chem", "intellichem")),
        "raw": raw,
        "error": error,
    }


class ScreenLogicWorker:
    def __init__(self) -> None:
        self.enabled = env_bool("SCREENLOGIC_ENABLED", True)
        self.adapter_host = os.environ.get("SCREENLOGIC_HOST", "").strip()
        self.adapter_port = env_int("SCREENLOGIC_ADAPTER_PORT", 80, 1)
        self.poll_seconds = env_int("SCREENLOGIC_POLL_SECONDS", 60, 15)
        self.use_discovery = env_bool("SCREENLOGIC_DISCOVERY", True)
        self.lock = threading.Lock()
        self.latest_raw: Any = {}
        self.last_update: str | None = None
        self.last_error: str | None = None
        self.connected = False
        self.bridge_status = "starting"
        self.gateway = None
        self.stop_event: asyncio.Event | None = None

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            raw = json_safe(self.latest_raw)
            return {
                "bridge": {
                    "service": "home23-screenlogic",
                    "enabled": self.enabled,
                    "status": self.bridge_status,
                    "connected": self.connected,
                    "lastUpdate": self.last_update,
                    "lastError": self.last_error,
                    "adapterHost": self.adapter_host or None,
                    "adapterPort": self.adapter_port,
                    "pollSeconds": self.poll_seconds,
                    "discovery": self.use_discovery,
                },
                **normalize_status(raw, self.connected, self.bridge_status, self.last_error),
                "fetchedAt": self.last_update,
            }

    def set_state(
        self,
        *,
        raw: Any | None = None,
        status: str | None = None,
        error: str | None = None,
        connected: bool | None = None,
    ) -> None:
        with self.lock:
            if raw is not None:
                self.latest_raw = json_safe(raw)
                self.last_update = iso_now()
            if status is not None:
                self.bridge_status = status
            if error is not None:
                self.last_error = error
            elif raw is not None:
                self.last_error = None
            if connected is not None:
                self.connected = connected

    async def make_gateway(self) -> Any:
        try:
            from screenlogicpy import ScreenLogicGateway, discovery
        except Exception as exc:
            raise RuntimeError("screenlogicpy is not installed; run `python3 -m pip install screenlogicpy`") from exc

        if self.adapter_host:
            gateway = ScreenLogicGateway()
            try:
                await gateway.async_connect(self.adapter_host, self.adapter_port)
            except TypeError:
                await gateway.async_connect(self.adapter_host)
            return gateway

        if not self.use_discovery:
            raise RuntimeError("SCREENLOGIC_HOST is empty and discovery is disabled")

        hosts = await discovery.async_discover()
        if not hosts:
            raise RuntimeError("no ScreenLogic gateway discovered on the local subnet")

        host = hosts[0]
        self.adapter_host = str(host.get("host") or host.get("ip") or host.get("address") or "")
        self.adapter_port = int(host.get("port") or self.adapter_port)
        gateway = ScreenLogicGateway()
        connect_kwargs = {
            key: host[key]
            for key in ("ip", "port", "gtype", "gsubtype", "name")
            if key in host
        }
        if connect_kwargs:
            await gateway.async_connect(**connect_kwargs)
        else:
            await gateway.async_connect(self.adapter_host, self.adapter_port)
        return gateway

    async def connect(self) -> None:
        self.set_state(status="connecting", connected=False)
        self.gateway = await self.make_gateway()
        self.set_state(status="connected", connected=True)

    async def update_once(self) -> None:
        if self.gateway is None:
            await self.connect()
        await self.gateway.async_update()
        self.set_state(raw=self.gateway.get_data(), status="connected", connected=True)

    async def loop(self) -> None:
        self.stop_event = asyncio.Event()
        if not self.enabled:
            self.set_state(status="disabled", error="SCREENLOGIC_ENABLED=false", connected=False)
            await self.stop_event.wait()
            return

        while not self.stop_event.is_set():
            try:
                await self.update_once()
            except Exception as exc:
                self.set_state(status="error", error=str(exc), connected=False)
                try:
                    if self.gateway is not None:
                        await self.gateway.async_disconnect()
                except Exception:
                    pass
                self.gateway = None
            try:
                await asyncio.wait_for(self.stop_event.wait(), timeout=self.poll_seconds)
            except asyncio.TimeoutError:
                pass

    async def shutdown(self) -> None:
        if self.stop_event:
            self.stop_event.set()
        if self.gateway is not None:
            try:
                await self.gateway.async_disconnect()
            except Exception:
                pass


worker = ScreenLogicWorker()


class Handler(BaseHTTPRequestHandler):
    server_version = "Home23ScreenLogic/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stdout.write("[screenlogic] " + (fmt % args) + "\n")

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in {"/", "/status"}:
            self.send_json(200, worker.snapshot())
            return
        if self.path == "/health":
            snap = worker.snapshot()
            self.send_json(200 if snap["bridge"]["status"] not in {"error"} else 503, snap["bridge"])
            return
        self.send_json(404, {"ok": False, "error": "not found"})


def main() -> int:
    port = env_int("SCREENLOGIC_BRIDGE_PORT", 5023, 1)
    host = os.environ.get("SCREENLOGIC_BRIDGE_HOST", "127.0.0.1")

    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=lambda: loop.run_until_complete(worker.loop()), daemon=True)
    thread.start()

    httpd = ThreadingHTTPServer((host, port), Handler)

    def stop(_signum: int, _frame: Any) -> None:
        loop.call_soon_threadsafe(lambda: asyncio.create_task(worker.shutdown()))
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    print(f"[screenlogic] bridge listening on http://{host}:{port}")
    try:
        httpd.serve_forever()
    finally:
        loop.call_soon_threadsafe(lambda: asyncio.create_task(worker.shutdown()))
        time.sleep(0.25)
        loop.call_soon_threadsafe(loop.stop)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
