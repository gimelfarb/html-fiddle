const fiddle = require('..');
const request = require('supertest');
const express = require('express');

test('passthrough if undefined opts', async () => {
    const app = express();
    app.use(fiddle());
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/Original/g);
});

test('passthrough if undefined through() func', async () => {
    const app = express();
    app.use(fiddle({}));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/Original/g);
});

test('unmodifed html if through() returns undefined ', async () => {
    const app = express();
    app.use(fiddle({
        through: () => {}
    }));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/Original/g);
});

test('compliant middleware', async () => {
    const middleware = fiddle({ through: () => {} });
    const res = {};
    const req = {};

    // Shouldn't throw ...
    middleware(req, res);

    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
});

test('error on response write', async () => {
    const app = express();
    app.use((_res, res, next) => {
        const _writeHead = res.writeHead.bind(res);
        let emitErr = true;
        res.writeHead = (...args) => {
            if (emitErr) {
                res.emit('error', new Error('Something wrong'));
                emitErr = false;
                return;
            }
            return _writeHead(...args);
        };
        next();
    });
    app.use(fiddle({
        through: () => {}
    }));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });
    const err_handler = jest.fn();
    app.use((err, req, res, next) => {
        err_handler(err);
        next(err);
    });

    const response = await request(app).get('/');
    expect(err_handler).toHaveBeenCalled();
    expect(response.status).toBe(500);
});
