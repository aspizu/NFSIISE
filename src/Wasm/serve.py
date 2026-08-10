#!/usr/bin/env python3

import argparse
import functools
import http.server
from pathlib import Path


class WasmHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve the threaded NFSIISE WebAssembly build")
    parser.add_argument("directory", nargs="?", default="build/wasm")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    directory = Path(args.directory).resolve()
    if not directory.is_dir():
        parser.error(f"build directory does not exist: {directory}")
    handler = functools.partial(WasmHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {directory} at http://127.0.0.1:{args.port}/nfs2se.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
