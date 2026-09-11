#!/usr/bin/env python3
"""Serve the dashboard locally and proxy /op requests to the live dashboard host."""

import argparse
import json
import os
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}
HEALTH_SERVICE_NAME = "plm-dashboard-local"


class DashboardHandler(SimpleHTTPRequestHandler):
    upstream = ""

    def do_GET(self):
        if self.path == "/__plm_health":
            self.send_health_response("GET")
            return
        if self.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/PLM%20Dashboard.html")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/op" or self.path.startswith("/op/"):
            self.proxy_request("GET")
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path == "/__plm_health":
            self.send_health_response("HEAD")
            return
        if self.path == "/op" or self.path.startswith("/op/"):
            self.proxy_request("HEAD")
            return
        super().do_HEAD()

    def send_health_response(self, method):
        body = json.dumps(
            {"service": HEALTH_SERVICE_NAME, "upstream": self.upstream}
        ).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if method != "HEAD":
            self.wfile.write(body)

    def proxy_request(self, method):
        upstream_url = f"{self.upstream}{self.path}"
        request_headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower()
            in {"accept", "accept-language", "if-modified-since", "if-none-match"}
        }
        request = Request(upstream_url, headers=request_headers, method=method)

        try:
            with urlopen(request, timeout=30) as response:
                self.send_proxy_response(
                    response.status, response.headers, response.read(), method
                )
        except HTTPError as error:
            self.send_proxy_response(error.code, error.headers, error.read(), method)
        except URLError as error:
            body = json.dumps(
                {"error": "OpenProject proxy unavailable", "detail": str(error.reason)}
            ).encode("utf-8")
            self.send_response(HTTPStatus.BAD_GATEWAY)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if method != "HEAD":
                self.wfile.write(body)

    def send_proxy_response(self, status, headers, body, method):
        self.send_response(status)
        for key, value in headers.items():
            if key.lower() not in HOP_BY_HOP_HEADERS and key.lower() != "content-length":
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if method != "HEAD":
            self.wfile.write(body)


def parse_args():
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8080, type=int)
    parser.add_argument(
        "--upstream",
        default=os.environ.get("PLM_DASHBOARD_UPSTREAM", "http://100.110.194.101"),
    )
    parser.add_argument(
        "--directory",
        default=repo_root / "design_handoff_plm_dashboard",
        type=Path,
    )
    return parser.parse_args()


def main():
    args = parse_args()
    dashboard_directory = args.directory.resolve()
    if not dashboard_directory.is_dir():
        print(f"Dashboard directory not found: {dashboard_directory}", file=sys.stderr)
        return 1

    DashboardHandler.upstream = args.upstream.rstrip("/")
    handler = partial(DashboardHandler, directory=str(dashboard_directory))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(
        f"PLM Dashboard: http://{args.host}:{args.port}/ "
        f"(API upstream: {DashboardHandler.upstream})",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
