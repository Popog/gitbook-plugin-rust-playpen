'use strict'

const getInstalledPath = require('get-installed-path');
const fs = require('fs-extra');
const path = require('path');

const FILES = [
    'ace.js',
    'theme-tomorrow.js',
    'mode-rust.js'
];

function parent_check(dir) {
  return new Promise((resolve, reject) => {
    var parent = path.join(dir, '..');
    while (true) {
      if (path.relative(parent, dir) == "node_modules") {
        return getInstalledPath('ace-builds', {
          local: true, cwd: path.resolve(parent)
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
var lcheck = getInstalledPath('ace-builds', {local: true});


lcheck.catch(_ => gcheck).catch(_ => pcheck).then(dir => {
  console.log(dir);
  for (var file of FILES) {
    var src = path.join(dir, 'src-min', file);
    var dest = path.join('book', 'ace', file);
    console.log(src + ' => ' + dest);
    fs.copy(src, dest, (err) => {
      if (err) throw err;
    });
  }
}, err => { throw err; });

// we succeeded, swallow other errors.
gcheck.catch(_ => {});
pcheck.catch(_ => {});
