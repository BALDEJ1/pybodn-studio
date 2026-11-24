# PyBodn Studio

A local web screen for reading and editing the memory file of
[pybodn](https://github.com/BALDEJ1/pybodn). It is a small open-source app that you clone, fork
or copy. It is not published to npm or PyPI.

The first version is being built in pull requests. Right now Studio starts and shows a
placeholder page; the memory screen comes in the next steps.

## Run it

You need Node.js 22.18 or later.

```bash
npm install
npm run dev
```

Studio prints a link such as `http://127.0.0.1:3000/?token=…`. Open that link: it signs your
browser in for this run, and the address then drops the token. Each start makes a new token, so
after a restart open the new link.

To run the built app instead of the development server:

```bash
npm run build
npm start
```

Studio uses port 3000. To use another, set `PORT`, for example `PORT=3001 npm run dev`. If the
port is taken, Studio stops and says so rather than moving to another one.

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

## License

MIT, see [LICENSE](LICENSE).
