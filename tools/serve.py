#!/usr/bin/env python3
"""IntegrityWatch Field - static dev server (Python 3.8+)."""
import argparse
import functools
import os
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(
        SimpleHTTPRequestHandler.extensions_map,
        **{
            ".webmanifest": "application/manifest+json",
            ".js": "text/javascript",
            ".mjs": "text/javascript",
            ".tsv": "text/tab-separated-values",
            ".csv": "text/csv",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".xml": "application/xml",
        },
    )

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    parser = argparse.ArgumentParser(description="IntegrityWatch Field dev server")
    parser.add_argument("--port", type=int, default=8419)
    parser.add_argument("--open", action="store_true", help="open the browser")
    parser.add_argument("--root", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    os.chdir(root)

    handler = functools.partial(Handler, directory=root)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), handler)

    url = "http://localhost:%d/" % args.port
    print("  IntegrityWatch Field - dev server")
    print("  URL:   %s" % url)
    print("  Root:  %s" % root)
    print("  Stop:  Ctrl+C")
    print()

    if args.open:
        webbrowser.open(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
