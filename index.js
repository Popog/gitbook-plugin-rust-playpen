module.exports = {
    book: {
        assets: './book',
        css: ['editor.css'],
        js: ['ace/ace.js','editor.js']
    },
    blocks: {
        rust_editor: {
            process: function(block) {
                var page = this.ctx.ctx.page;
                if (page.editors === undefined) {
                    page.editors = 0;
                } else {
                  page.editors++;
                }

                return '<div class="active-code" id="active-code-' + page.editors + '">' +
                '\n<button class="btn run-code"   type="button" onclick="executeCode(' + page.editors + ')">Run</button>' +
                '\n<button class="btn reset-code" type="button" onclick="resetCode(' + page.editors + ')">Reset</button>' +
                '\n<div class="editor"><pre>' + block.body + '</pre></div>' +
                '\n<div class="result"></div>' +
                '\n</div>';
            }
        }
    }
};
