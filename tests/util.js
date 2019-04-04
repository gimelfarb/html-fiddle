const stream = require('stream');

exports.stream = {
    // Replace stream with new contents
    replace: (body) => new stream.Duplex({
        read() {
            this.push(body);
            this.push(null);
        },
        write(_chunk, _encoding, cb) {
            cb();
        }
    }),
    // Modify stream data with regex
    regex: (rex, replacer) => new stream.Transform({
        transform(chunk, _encoding, cb) {
            this._str = (this._str || '') + chunk;
            cb();
        },
        flush(cb) {
            const replaced = this._str.replace(rex, replacer);
            cb(null, replaced);
        }
    })
};

// Helper to make listen() a promise fulfilled with server info
exports.listen = (server, ...args) => {
    return new Promise((resolve, reject) => {
        server.listen(...args, function (err) {
            err ? reject(err) : resolve({
                port: this.address().port,
                address: this.address(),
                server: this,
                close: this.close.bind(this)
            });
        });
    });
};
