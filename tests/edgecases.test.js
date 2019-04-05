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