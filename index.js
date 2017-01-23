const escapeHTML = require('escape-html');

module.exports = {
    book: {
        assets: './book',
        css: ['editor.css'],
        js: ['ace/ace.js','editor.js']
    },
    blocks: {
        rust_editor: {
            blocks: ['include'],
            process: function(block) {
                const readFileAsString = this.readFileAsString.bind(this);
                var page = this.ctx.ctx.page;
                if (page.editors === undefined) {
                    page.editors = 0;
                } else {
                    page.editors++;
                }

                for (var sblock of block.blocks) {
                    if (sblock.args.length < 1) {
                        throw "Include block missing argument";
                    } else if (sblock.args.length > 1) {
                        throw "Include block too many arguments";
                    }
                }

                var result = '<div class="active-code" id="active-code-' + page.editors + '">' +
                    '\n<button class="btn run-code"   type="button" onclick="executeCode(' + page.editors + ')">Run</button>' +
                    '\n<button class="btn reset-code" type="button" onclick="resetCode(' + page.editors + ')">Reset</button>' +
                    '\n<div class="editor"><pre>' + escapeHTML(block.body);

                var sblocks = Promise.all(block.blocks.map(sblock =>
                    readFileAsString(sblock.args[0]).then(file => ({
                        file: file, body: sblock.body || ''
                    }))
                ));

                return sblocks.then(sblocks => {
                    for (var sblock of sblocks) {
                        result += escapeHTML(sblock.file) + escapeHTML(sblock.body);
                    }

                    result += '</pre></div>' +
                    '\n<div class="result"></div>' +
                    '\n</div>';

                    return result;
                });
            }
        }
    }
};
