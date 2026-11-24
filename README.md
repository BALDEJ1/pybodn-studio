# PyBodn Studio

A local web screen for reading and editing the memory file of
[pybodn](https://github.com/BALDEJ1/pybodn). It is a small open-source app that you clone, fork
or copy. It is not published to npm or PyPI.

The first version is being built in pull requests. Right now Studio opens the memory file and
lists its namespaces with their counts; the memory screen comes in the next steps.

## Run it

You need Node.js 22.18 or later and [uv](https://docs.astral.sh/uv/). Point `PYBODN_DB` at the
memory file of your application:

```bash
npm install
PYBODN_DB=path/to/memory.db npm run dev
```

Studio prints a link such as `http://127.0.0.1:3000/?token=…`. Open that link: it signs your
browser in for this run, and the address then drops the token. Each start makes a new token, so
after a restart open the new link.

To run the built app instead of the development server:

```bash
npm run build
npm start
```

If something stops Studio from opening the file, such as a wrong path, the page says what it is
and how to fix it. The first start installs Python and pybodn, which can take a minute.

Studio uses port 3000. To use another, set `PORT`, for example `PORT=3001 npm run dev`. If the
port is taken, Studio stops and says so rather than moving to another one.

## The Python side

Studio reads and writes the memory file only through pybodn itself, so the file stays as pybodn
expects it. A small Python program, `bridge/bridge.py`, runs pybodn and answers Studio over its
standard input and output. uv installs Python and pybodn for it the first time.

To use a Python of your own that already has pybodn 1.2 or later, set `PYBODN_PYTHON` to it.
Studio runs that program, so set it only to a Python you trust. The bridge gets only the variables
it needs, such as `PATH`, `HOME` and `PYBODN_DB`, and never the rest of your environment.

The bridge opens only a file that already exists and is not empty. Opening a file is also a
write: pybodn may bring an older file up to its own format. If your application uses an older
pybodn than the bridge, upgrade the application first.

To try Studio on sample memories, make a demo file:

```bash
npm run seed
```

It writes `demo.db` and never touches a file that is already there. Then start Studio on it:

```bash
PYBODN_DB=demo.db npm run dev
```

## Safety

The memory of an agent can hold personal data, so Studio keeps it on your computer.

- It listens on 127.0.0.1 only, so other machines on your network cannot reach it.
- Every request needs the cookie that the printed link sets, so other programs and other users of
  your computer cannot read or change the file without that link.
- It answers only to the names 127.0.0.1 and localhost, so a web page that points its own name
  at your computer gets nothing.
- A change is accepted only from Studio's own page, and no other site can show Studio in a frame.

Start Studio only with `npm run dev` or `npm start`. Running `next dev` or `next start` yourself
would listen on every network address without these checks, so Studio stops at once when started
that way. Do not put Studio on a server or open its port to a network.

## Work on it

```bash
npm test
npm run lint
npm run typecheck
npm run format:check
```

The browser scenarios run on the built app. Install their browser once, then:

```bash
npx playwright install --only-shell chromium
npm run build
npm run e2e
```

And for the bridge, from the `bridge` folder:

```bash
uv run pytest
uv run ruff check
uv run mypy
```

## License

MIT, see [LICENSE](LICENSE).
