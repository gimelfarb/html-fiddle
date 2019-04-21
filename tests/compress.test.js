const fiddle = require('..');
const request = require('supertest');
const express = require('express');
const compression = require('compression');
const zlib = require('zlib');
const stream = require('stream');

// Workaround middleware for testing - because 'compression' module
// doesn't support brotli yet officially! (as of 5 Apr 2019)
function brotlicompression_workaround() {
    // Don't test on Node before v11.7, which added brotli support
    if (!zlib.createBrotliCompress) return;
    return (req, res, next) => {
        const _writeHead = res.writeHead.bind(res);
        const upstream = new stream.Writable({
            write: res.write.bind(res),
            final: res.end.bind(res)
        });
        let fwdstream = upstream;
        res.writeHead = (...args) => {
            if (req.acceptsEncodings('br')) {
                res.setHeader('Content-Encoding', 'br');
                res.removeHeader('Content-Length');
                fwdstream = zlib.createBrotliCompress();
                fwdstream.pipe(upstream);
            }
            _writeHead(...args);
        };
        res.write = (...args) => {
            res.headersSent || res.writeHead(res.statusCode);
            fwdstream.write(...args);
        };
        res.end = (...args) => {
            res.headersSent || res.writeHead(res.statusCode);
            fwdstream.end(...args);
        };
        next && next();
    };
}

describe.each([
    ['gzip', () => compression({ threshold: 0 })],
    ['deflate', () => compression({ threshold: 0 })],
    ['br', () => brotlicompression_workaround()]
])(
    'test codec - %s',
    (codec, middlewarefn) => {
        // Make some tests optional
        const compress_middleware = middlewarefn();
        if (!compress_middleware) return;

        test('express compression works', async () => {
            const app = express();
            app.use(compress_middleware);
            app.get('/', (_req, res) => {
                res.send('<html><body>Original!</body></html>');
            });
        
            const reqObj = request(app).get('/').set('Accept-Encoding', codec);
            reqObj._shouldUnzip = () => false;
        
            const response = await reqObj;
            expect(response.status).toBe(200);
            expect(response.get('Content-Type')).toMatch(/text\/html/g);
            expect(response.get('Content-Encoding')).toBe(codec);
            expect(response.text).not.toMatch(/Original/g);
        });
        
        test('decompress original html', async () => {
            const app = express();
            app.use(fiddle({
                through: () => {}
            }));
            app.use(compress_middleware);
            app.get('/', (_req, res) => {
                res.send('<html><body>Original!</body></html>');
            });
        
            const reqObj = request(app).get('/').set('Accept-Encoding', codec);
            reqObj._shouldUnzip = () => false;
        
            const response = await reqObj;
            expect(response.status).toBe(200);
            expect(response.get('Content-Type')).toMatch(/text\/html/g);
            expect(response.get('Content-Encoding')).toBeUndefined();
            expect(response.text).toMatch(/Original/g);
        });
    }
);

const unsupported_codec_tests = [['custom']];
if (!zlib.createBrotliDecompress) { unsupported_codec_tests.push(['br']); }

describe.each(unsupported_codec_tests)(
    'unsupported compression - %s',
    (codec) => {
        test('ignore content with unsupported compression', async () => {
            const app = express();
            const fiddle_through = jest.fn();
            app.use(fiddle({
                through: fiddle_through
            }));
            app.get('/', (_req, res) => {
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('Content-Encoding', codec);
                res.send(Buffer.from('abcdefghijklmnop'));
            });
        
            const response = await request(app).get('/');
            expect(response.status).toBe(200);
            expect(response.get('Content-Type')).toMatch(/text\/html/g);
            expect(response.get('Content-Encoding')).toMatch(codec);
            expect(response.text).toMatch('abcdefghijklmnop');
            expect(fiddle_through).not.toHaveBeenCalled();        
        });
    }
)

test('error on garbage compression', async () => {
    const app = express();
    app.use(fiddle({
        through: () => {}
    }));
    app.get('/', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Encoding', 'gzip');
        res.send(Buffer.from('uiweykwegkdsfhjksdjhfkj'));
    });
    const err_handler = jest.fn();
    app.use((err, req, res, next) => {
        err_handler(err);
        next(err);
    });

    const response = await request(app).get('/');
    expect(err_handler).toHaveBeenCalled();
    expect(err_handler).toHaveBeenCalledWith(
        expect.objectContaining({
            stack: expect.stringMatching(/zlib/g),
            code: expect.stringMatching("Z_DATA_ERROR")
        })
    );
    expect(response.status).toBe(500);
});

test('re-compressing modified html', async () => {
    const app = express();
    app.use(compression({ threshold: 0 }));
    app.use(fiddle({
        through: () => {}
    }));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const reqObj = request(app).get('/').set('Accept-Encoding', 'gzip');
    const response = await reqObj;
    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toMatch(/text\/html/g);
    expect(response.get('Content-Encoding')).toBe('gzip');
    expect(response.text).toMatch(/Original/g);
});
