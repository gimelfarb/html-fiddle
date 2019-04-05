const fiddle = require('..');
const request = require('supertest');
const express = require('express');
const util = require('./util');

test('can replace html output', async () => {
    const app = express();
    app.use(fiddle({
        through: () => util.stream.replace('<html><body>Replaced!</body></html>')
    }));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toMatch(/text\/html/g);
    expect(response.text).toMatch(/Replaced/g);
});

test('can modify html output', async () => {
    const app = express();
    app.use(fiddle({
        through: () => util.stream.regex(/Original/, 'Replaced')
    }));
    app.get('/', (_req, res) => {
        res.send('<html><body>Original!</body></html>');
    });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toMatch(/text\/html/g);
    expect(response.text).toMatch(/<body>Replaced!<\/body>/g);
});

test('explicit writeHead works', async () => {
    const app = express();
    app.use(fiddle({
        through: () => util.stream.regex(/Original/, 'Replaced')
    }));
    app.get('/', (_req, res) => {
        const html = '<html><body>Original!</body></html>';
        res.writeHead(200, 'OK', { 'Content-Type': 'text/html', 'Content-Length': html.length, 'X-Custom': 'test' });
        res.end(html);
    });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.get('Content-Type')).toMatch(/text\/html/g);
    expect(response.get('Content-Length')).toBeUndefined();
    expect(response.get('X-Custom')).toBe('test');
    expect(response.text).toMatch(/<body>Replaced!<\/body>/g);
});
