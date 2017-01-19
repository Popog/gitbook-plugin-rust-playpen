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

                var result = '<div class="active-code" id="active-code-' + page.editors + '">' +
                    '\n<button class="btn run-code"   type="button" onclick="executeCode(' + page.editors + ')">Run</button>' +
                    '\n<button class="btn reset-code" type="button" onclick="resetCode(' + page.editors + ')">Reset</button>' +
                    '\n<div class="editor"><pre>' + block.body;

                var sblocks = Promise.all(block.blocks.map(sblock =>
                    readFileAsString(sblock.args[0]).then(file => ({
                        file: file, body: sblock.body || ''
                    }))
                ));

                return sblocks.then(sblocks => {
                    for (var sblock of sblocks) {
                        result += sblock.file + sblock.body;
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
