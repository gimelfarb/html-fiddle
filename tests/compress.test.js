const fiddle = require('..');
const request = require('supertest');
const express = require('express');
const compression = require('compression');

test('express compression works', async () => {
    const app = express();
    app.use(compression({ threshold: 0 }));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const reqObj = request(app).get('/').set('Accept-Encoding', 'gzip');
    reqObj._shouldUnzip = () => false;

    const response = await reqObj;
    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toMatch(/text\/html/g);
    expect(response.get('Content-Encoding')).toBe('gzip');
    expect(response.text).not.toMatch(/Original/g);
});

test('decompress original html', async () => {
    const app = express();
    app.use(fiddle({
        through: () => {}
    }));
    app.use(compression({ threshold: 0 }));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const reqObj = request(app).get('/').set('Accept-Encoding', 'gzip');
    reqObj._shouldUnzip = () => false;

    const response = await reqObj;
    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toMatch(/text\/html/g);
    expect(response.get('Content-Encoding')).toBeUndefined();
    expect(response.text).toMatch(/Original/g);
});

test('ignore content with unsupported compression', async () => {
    const app = express();
    const fiddle_through = jest.fn();
    app.use(fiddle({
        through: fiddle_through
    }));
    app.get('/', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Encoding', 'custom');
        res.send(Buffer.from('abcdefghijklmnop'));
    });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toMatch(/text\/html/g);
    expect(response.get('Content-Encoding')).toMatch('custom');
    expect(response.text).toMatch('abcdefghijklmnop');
    expect(fiddle_through).not.toHaveBeenCalled();
});

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
