from dotenv import load_dotenv
import os
import sys
from datetime import datetime
import mitmproxy
from mitmproxy import http, ctx
from mitmproxy.coretypes import multidict
import psycopg2
from psycopg2.extras import execute_values

load_dotenv()


def mdv_to_dict(mdv: multidict) -> dict:
    """
    mitmproxy uses an internal datastructure which allows multiple values for one key.
    This function converts this into a (key, array) dict. It tries to decode the values and keys as well.
    """
    tmp = dict()
    if not mdv:
        return tmp
    for t in mdv.fields:
        # as we only use this for headers and cookies I assume utf-8, else we replace the char
        try:
            key = str(t[0], encoding='utf-8', errors="replace")
        except TypeError:
            key = t[0]
        try:
            tmp[key] = [str(x, encoding='utf-8', errors="replace")
                        for x in t[1:]]
        except TypeError:
            tmp[key] = [str(x) for x in t[1:]]
    return tmp


class MitmAddon:
    def __init__(self):
        self.conn = None
        self.cur = None
        self.run_id = -1

    def request(self, flow: http.HTTPFlow):
        r: http.HTTPRequest = flow.request
        self.cur.execute(
            "INSERT INTO requests (run, start_time, host, port, method, scheme, authority, path, http_version, content_raw) VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;",
            (self.run_id, datetime.fromtimestamp(r.timestamp_start), r.pretty_host, r.port, r.method, r.scheme, r.authority,
             r.path,
             r.http_version, r.content))
        request_id: int = self.cur.fetchone()[0]
        self.conn.commit()
        # try to decode the content and update the row
        try:
            decoded: str = r.content.decode()
            self.cur.execute(
                "UPDATE requests SET content = %s  WHERE id = %s", (decoded, request_id))
            self.conn.commit()
        except ValueError:
            pass
        # headers
        decoded_headers: dict = mdv_to_dict(r.headers)
        if len(decoded_headers) > 0:
            # print([(request_id, k, v) for k, v in decoded_headers.items()])
            execute_values(self.cur, "INSERT INTO headers (request, name, values) VALUES %s",
                           [(request_id, k, v) for k, v in decoded_headers.items()])
            self.conn.commit()

        # trailers
        decoded_trailers: dict = mdv_to_dict(r.trailers)
        if decoded_trailers and len(decoded_trailers) > 0:
            # print([(request_id, k, v) for k, v in decoded_trailers.items()])
            execute_values(self.cur, "INSERT INTO trailers (request, name, values) VALUES %s",
                           [(request_id, k, v) for k, v in decoded_trailers.items()])
            self.conn.commit()

        # cookies
        decoded_cookies: dict = mdv_to_dict(r.cookies)
        if len(decoded_cookies) > 0:
            # print([(request_id, k, v) for k, v in decoded_headers.items()])
            execute_values(self.cur, "INSERT INTO cookies (request, name, values) VALUES %s",
                           [(request_id, k, v) for k, v in decoded_cookies.items()])
            self.conn.commit()

    def load(self, loader: mitmproxy.addonmanager.Loader):
        loader.add_option(
            name="run",
            typespec=str,  # For int, I get: "TypeError: Expected <class 'int'> for run, but got <class 'str'>." *shrug*
            default='',
            help="The ID of the run in the database"
        )

        self.conn = psycopg2.connect(host=os.environ['POSTGRES_HOST'] or 'localhost', port=os.environ['HOST_PORT'],
                                     dbname=os.environ['POSTGRES_DB'], user=os.environ['POSTGRES_USER'], password=os.environ['POSTGRES_PASSWORD'])
        self.cur = self.conn.cursor()

    def running(self):
        if not ctx.options.run or not int(ctx.options.run):
            print("ID of the current run not specified, shutting down.. (Hint: Use `--set run=run_id`)", file=sys.stderr)
            ctx.master.shutdown()
            sys.exit(1)
        self.run_id = int(ctx.options.run)

    def done(self):
        self.cur.execute(
            "UPDATE runs SET end_time = now() WHERE id=%s", (self.run_id,))
        self.conn.commit()
        self.conn.close()


addons = [MitmAddon()]

# This script is based on the work for the "Do they track? Automated analysis of Android apps for privacy violations"
# research project (https://benjamin-altpeter.de/doc/presentation-android-privacy.pdf), which is licensed under the
# following license:
#
# The MIT License
#
# Copyright 2020 ??? 2021 Malte Wessels
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
