const fiddle = require('..');
const httpProxy = require('http-proxy');
const request = require('supertest');
const express = require('express');
const util = require('./util');

test('can modify proxied html', async () => {
    const app = express();
    app.get('/', (_req, res) => {
        res.send('<html><body>This will be proxied!</body></html>');
    });
    const { port, close } = await util.listen(app);

    try {
        const proxyapp = express();
        const proxy = httpProxy.createProxyServer({
            target: `http://localhost:${port}/`
        });
        proxyapp.use(fiddle({
            through: () => util.stream.regex(/will be/, 'was')
        }));
        proxyapp.use((req, res) => proxy.web(req, res));
        
        const response = await request(proxyapp).get('/');
        expect(response.status).toBe(200);
        expect(response.get('Content-Type')).toMatch(/text\/html/g);
        expect(response.text).toMatch(/This was proxied!/g);
    } finally {
        close();
    }
});

test('do not modify non-html proxied resources', async () => {
    const app = express();
    app.get('/', (_req, res) => {
        res.send({ some: 'json' });
    });
    const { port, close } = await util.listen(app);

    try {
        const proxyapp = express();
        const proxy = httpProxy.createProxyServer({
            target: `http://localhost:${port}/`
        });
        const throughfunc = jest.fn();
        proxyapp.use(fiddle({
            through: throughfunc
        }));
        proxyapp.use((req, res) => proxy.web(req, res));

        const response = await request(proxyapp).get('/');
        expect(response.status).toBe(200);
        expect(response.get('Content-Type')).toMatch(/application\/json/g);
        expect(throughfunc).not.toHaveBeenCalled();
    } finally {
        close();
    }
});
