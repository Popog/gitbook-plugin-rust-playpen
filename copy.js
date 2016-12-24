'use strict'

const getInstalledPath = require('get-installed-path');
const fs = require('fs-extra');
const path = require('path');

const FILES = [
    'ace.js',
    'mode-rust.js'
];

/ ECMAScript 6 Backwards compatability
if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function(str, pos) {
        pos = pos || 0;
        return this.slice(pos, str.length) === str;
    };
}

if (typeof String.prototype.endsWith != 'function') {
    String.prototype.endsWith = function(searchString, position) {
        var subjectString = this.toString();
        if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.lastIndexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

function parent_check(dir) {
    return new Promise((resolve, reject) => {
        var parent = path.join(dir, '..');
        while (true) {
            if (path.relative(parent, dir) == "node_modules") {
                return getInstalledPath('ace-builds', {
                    local: true,
                    cwd: path.resolve(parent)
                }).catch(reason => parent_check(parent)).then(resolve, reject);
            }
            var parse = path.parse(parent);
            if (parse.dir == parse.root) {
                return reject(new Error("no parent directory"));
            }
            dir = parent;
            parent = path.join(parent, '..');
        }
    })
}

var pcheck = parent_check(path.resolve('.'));
var gcheck = getInstalledPath('ace-builds');
var lcheck = getInstalledPath('ace-builds', {
    local: true
});


lcheck.catch(_ => gcheck).catch(_ => pcheck).then(dir => {
    console.log(dir);

    // Copy all the themes
    fs.readdir(path.join(dir, 'src-min'), (err, files) => {
        if (err) throw err;
        for (const file of files) {
            if (!file.startsWith("theme-") || !file.endsWith(".js")) continue;
            var src = path.join(dir, 'src-min', file);
            var dest = path.join('book', 'ace', file);
            fs.copy(src, dest, {
                replace: true
            }, (err) => {
                if (err) throw err;
            });
        }
    });

    // Copy all the static files
    for (const file of FILES) {
        var src = path.join(dir, 'src-min', file);
        var dest = path.join('book', 'ace', file);
        console.log(src + ' => ' + dest);
        fs.copy(src, dest, {
            replace: true
        }, (err) => {
            if (err) throw err;
        });
    }
}, err => {
    throw err;
});

// we succeeded, swallow other errors.
gcheck.catch(_ => {});
pcheck.catch(_ => {});
