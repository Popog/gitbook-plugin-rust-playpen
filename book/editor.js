// this is mostly the editor implemented by @SergioBenitez for graydon/rust-www
// plus small modifications to accommodate a "Reset" button

// ECMAScript 6 Backwards compatability
if (typeof String.prototype.startsWith !== 'function') {
    String.prototype.startsWith = function(str, pos) {
        pos = pos || 0;
        return this.slice(pos, str.length) === str;
    };
}

var THEMES = ['tomorrow', 'solarized_light', 'tomorrow_night'];

// Regex for finding new lines
var newLineRegex = /(?:\r\n|\r|\n)/g;

// Error message to return when there's a server failure
var errMsg = 'The server encountered an error while running the program.';

var Range = ace.require('ace/range').Range;
var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;

// The current theme
var currentTheme = undefined;

// Ace editor info
var activeCodes;

// Maximum length of a response before it has to be truncated
var MAX_RESPONSE_LENGTH = 50000;

// Get the theme from number from a classList
function getTheme(classList) {
    for (var i = 0; i < classList.length; i++) {
        var entry = classList[i];
        if (entry.startsWith('color-theme-'))
            return parseInt(entry.slice('color-theme-'.length), 10);
    }
    return 0;
}

// Get the editor id number from an id
function getActiveCodeId(id) {
    if (id.startsWith('active-code-'))
        return parseInt(id.slice('active-code-'.length), 10);
    return undefined;
}

// Create a marker, returns the Ace marker ID
function createMarker(editor, category, start_line, start_col, end_line, end_col) {
    var r = new Range(); // Creates a range with undefined values.
    r.start = editor.session.doc.createAnchor(start_line, start_col);
    r.end = editor.session.doc.createAnchor(end_line, end_col);
    return editor.session.addMarker(r, 'ace-' + category + '-text', 'text', false);
}

// Set the highlight mode of a marker, takes an Ace marker ID and a boolean
function highlightMarker(activeCodeId, id, highlight) {
    var editor = activeCodes[activeCodeId].editor;
    marker = editor.session.getMarkers()[id];
    if (highlight)
        marker.clazz += ' ace-hover-text';
    else
        marker.clazz = marker.clazz.split(" ", 1)[0];

    editor.scrollToLine(Math.round((marker.range.start.row + marker.range.end.row) / 2), true, true);
}

// Moves the cursor to a marker, takes an Ace marker ID
function focusMarker(activeCodeId, id) {
    var editor = activeCodes[activeCodeId].editor;
    var marker = editor.session.getMarkers()[id];
    editor.focus();
    editor.scrollToLine(marker.range.start.row - 1, true, true);
    editor.selection.clearSelection();
    editor.selection.moveCursorTo(marker.range.start.row, marker.range.start.column, false);
}

// Removes all the markers
function clearMarkers(editor) {
    // getMarkers returns an object, not an array.
    var markers = editor.session.getMarkers();
    for (var id in markers) {
        var marker = markers[id];

        // Skip markers that we didn't create
        if (marker.clazz.search(/ace-.*-text/) === -1) continue;

        marker.range.end.detach();
        marker.range.start.detach();
        editor.session.removeMarker(marker.id);
    }
}

// The callback for the Reset button
function resetCode(activeCodeId) {
    var activeCode = activeCodes[activeCodeId];

    // Clear previous markers, if any
    clearMarkers(activeCode.editor)

    activeCode.editor.session.setValue(activeCode.originalCode);
    activeCode.resultDiv.style.display = 'none';
}

require(['gitbook'], function(gitbook) {
    // Init configuration at start
    gitbook.events.bind('start', function(e, config) {
        var opts = config['rust-playpen'];
        THEMES = opts.themes || THEMES;
        for (var theme of THEMES) {
            ace.require('ace/theme/' + theme);
        }

        // Watch the book so we can change themes
        var book = document.querySelector('div.book');
        currentTheme = getTheme(book.classList);
        if (MutationObserver) {
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(e) {
                    if (e.attributeName !== 'class') return;
                    var nextTheme = getTheme(book.classList)
                    if (nextTheme === currentTheme) return;
                    currentTheme = nextTheme;
                    for (var activeCode of activeCodes) {
                        activeCode.editor.setTheme('ace/theme/' + THEMES[currentTheme]);
                    }
                });
            });

            observer.observe(book, {
                subtree: false,
                attributes: true
            });
        }

    });

    gitbook.events.bind('page.change', function() {
        activeCodes = [];
        // Fetching DOM items
        var activeCodeDivs = document.getElementsByClassName('active-code');
        for (var i = 0; i < activeCodeDivs.length; i++) {
            var acd = activeCodeDivs[i];

            // Setup ace editor
            var editorDiv = acd.querySelector('div.editor');
            var editor = ace.edit(editorDiv);
            editor.setTheme('ace/theme/' + THEMES[currentTheme])
            editor.setOptions({ maxLines: 15 });
            editor.session.setMode('ace/mode/rust');
            editor.setShowPrintMargin(false);
            editor.renderer.setShowGutter(false);
            editor.setHighlightActiveLine(false);
            editor.$blockScrolling = Infinity;
            // Highlight active line when focused
            editor.on('focus', editor.setHighlightActiveLine.bind(editor, true));
            editor.on('blur', editor.setHighlightActiveLine.bind(editor, false));

            var activeCode = {
                id: getActiveCodeId(acd.id),
                editorDiv: editorDiv,
                resultDiv: acd.querySelector('div.result'),
                editor: editor,
                originalCode: editor.session.getValue()
            };
            activeCodes[activeCode.id] = activeCode;

            // Setup any callbacks
            editor.commands.addCommand({
                name: 'run',
                bindKey: {
                    win: 'Ctrl-Enter',
                    mac: 'Ctrl-Enter'
                },
                exec: executeCode.bind(undefined, activeCode.id)
            });
        }
    })
});

//
// escapeHTML() borrowed from mustache.js:
// https://github.com/janl/mustache.js/blob/master/mustache.js#L43
//
// via:
// http://stackoverflow.com/questions/24816/escaping-html-strings-with-jquery/12034334#12034334
//
var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
    '/': '&#x2F;'
};

function escapeHTML(unsafe) {
    return String(unsafe).replace(/[&<>"'\/]/g, function(s) { return entityMap[s] });
}

var COLOR_CODES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

// A simple function to decode ANSI escape codes into HTML.
// This is very basic, with lots of very obvious omissions and holes;
// it’s designed purely to cope with rustc output.
//
// TERM=xterm rustc uses these:
//
// - bug/fatal/error = red
// - warning = yellow
// - note = green
// - help = cyan
// - error code = magenta
// - bold
function ansi2html(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\x1b\[1m\x1b\[3([0-7])m([^\x1b]*)(?:\x1b\(B)?\x1b\[0?m/g, function(original, colorCode, text) { return '<span class=ansi-' + COLOR_CODES[+colorCode] + '><strong>' + text + '</strong></span>' })
        .replace(/\x1b\[3([0-7])m([^\x1b]*)(?:\x1b\(B)?\x1b\[0?m/g, function(original, colorCode, text) { return '<span class=ansi-' + COLOR_CODES[+colorCode] + '>' + text + '</span>' })
        .replace(/\x1b\[1m([^\x1b]*)(?:\x1b\(B)?\x1b\[0?m/g, function(original, text) { return '<strong>' + text + '</strong>' })
        .replace(/(?:\x1b\(B)?\x1b\[0m/g, '');
}

function processCompilerOutput(activeCode, text) {
    var output = '';
    var error = false;
    text.split(newLineRegex).forEach(function(line, i) {
        if (!line.startsWith('{')) {
          output += ansi2html(line) + '\n';
          return;
        }

        error = error || line.level === 'error';

        line = JSON.parse(line);
        if (line.rendered) {
            var span_id = 0;
            output += ansi2html(line.rendered)
                .replace(/<strong>error\[(E\d\d\d\d)\]<\/strong>/g, function(text, code){ return '<strong>error[<a href=https://doc.rust-lang.org/error-index.html#' + code + ' target=_blank>' + code + '</a>]</strong>' })
                .replace(/^  <span class="ansi-blue"><strong>--&gt; <\/strong><\/span>&lt;.*?&gt;:\d+:\d+$/mg, function(text) {
                    var span = line.spans[span_id]
                    span_id++;
                    return '  <span class="ansi-blue"><strong>--&gt; </strong></span><a onclick="javascript:focusMarker(' +  activeCode.id + ', ' +
                        id + ')" onmouseover="javascript:highlightMarker(' +  activeCode.id + ', ' +
                        id + ', true)" onmouseout="javascript:highlightMarker(' + activeCode.id + ', ' +
                        id + ', false)" class="linejump">' + escapeHTML(span.file_name) + ':' + span.line_start + ':' + span.column_start + '</a>';
                }) + '\n';
            return;
        }

        var color = '';
        switch (line.level) {
            case 'error':
                color = ' class="ansi-red"';
                break;
            case "warning":
                color = ' class="ansi-yellow"';
                break;
        }


        output += '<span' + color + '><strong>' + line.level;
        if (line.code && line.code.code) {
            output += '[<a href="https://doc.rust-lang.org/error-index.html#' + line.code.code + '" target="_blank">' + line.code.code + '</a>]';
        }
        output += '</strong></span><strong>: ' + line.message + '</strong>';

        for (var span of line.spans) {
            if (span.expansion && span.expansion.span)
                line.spans.push(span.expansion.span);

            if (span.file_name !== '<anon>')
                continue;

            var spaces = ' '.repeat(span.line_start.toString().length);
            var id = createMarker(activeCode.editor, line.level, span.line_start - 1, span.column_start - 1, span.line_end - 1, span.column_end - 1);
            output += '\n' + spaces + '<span class="ansi-blue"><strong>--&gt; </strong></span><a onclick="javascript:focusMarker(' + activeCode.id + ', ' +
                id + ')" onmouseover="javascript:highlightMarker(' + activeCode.id + ', ' +
                id + ',true)" onmouseout="javascript:highlightMarker(' + activeCode.id + ', ' +
                id + ', false)" class="linejump">' + escapeHTML(span.file_name) + ':' + span.line_start + ':' + span.column_start + '</a>' +
                '\n' + spaces + ' <span class="ansi-blue"><strong>|</strong></span>';
            span.text.forEach(function(text, line_number) {
                line_number += span.line_start;
                output += '\n<span class="ansi-blue"><strong>' + line_number + ' | </strong></span> ' + text.text +
                    '\n' + spaces + ' <span class="ansi-blue"><strong>| </strong></span>' + ' '.repeat(text.highlight_start) + '<span' + color + '><strong>' + '^'.repeat(text.highlight_end - text.highlight_start) + '</strong></span><span' + color + '><strong> ' + (span.label || '') + '</strong></span>';
            });
            if (span.label)
                output += '\n' + spaces + ' <span class=\"ansi-blue\"><strong>|</strong></span>';
        }
        for (var child of line.children) {
            var ccolor = '';
            switch (child.level) {
                case 'error':
                    ccolor = ' class="ansi-red"';
                    break;
                case 'warning':
                    ccolor = ' class="ansi-yellow"';
                    break;
            }

            output += '\n' + spaces + ' <span class="ansi-blue"><strong>= </strong></span><span' + ccolor + '><strong>' + child.level;
            if (child.code && child.code.code) {
                output += '[<a href="https://doc.rust-lang.org/error-index.html#' + child.code.code + '" target="_blank">' + child.code.code + '</a>]';
            }
            output += '</strong></span><strong>: ' + child.message + '</strong>';
        }
        output += '\n';
    });

    // Remove the trailing CR
    output = output.slice(0, -1);

    return {output: output, error: error};
}

// The callback for the Run button
function executeCode(activeCodeId) {
    var activeCode = activeCodes[activeCodeId];

    activeCode.resultDiv.style.display = 'block';
    activeCode.resultDiv.innerHTML = 'Running...';

    // Clear previous markers
    clearMarkers(activeCode.editor);

    // Get the code, run the program
    var program = activeCode.editor.getValue();

    var req = new XMLHttpRequest();
    var data = JSON.stringify({
        version: 'stable',
        optimize: '0',
        separate_output: true,
        color: true,
        code: program,
        json_format: true
    });

    // console.log("Sending", data);
    req.open('POST', 'https://play.rust-lang.org/evaluate.json', true);
    req.onreadystatechange = function() {
        // Wait for the request to complete
        if (req.readyState !== 4) return;
        if (req.status !== 200) return handleError(activeCode);

        var response = JSON.parse(req.response);
        if (!response.rustc) return handleError(activeCode);

        return handleResult(activeCode, {
            compiler: response.rustc,
            program: response.program
        });
    };

    req.setRequestHeader('Content-Type', 'application/json');
    req.send(data);
}

// The error handler for executeCode
function handleError(activeCode) {
    // Clear out the result content
    activeCode.resultDiv.textContent = '';

    var samp = document.createElement('samp');
    samp.innerHTML = errMsg;
    var pre = document.createElement('pre');
    pre.className = 'rustc-output rustc-errors'
    pre.appendChild(samp);
    activeCode.resultDiv.appendChild(pre);
}

// The result handler for executeCode
function handleResult(activeCode, result) {
    // Clear out the result content
    activeCode.resultDiv.textContent = '';

    var compiler = result.compiler || '';
    var program = result.program || '';

    // Unpack the compiler output from the json format
    var processed = processCompilerOutput(activeCode, compiler);
    compiler = processed.output;

    // Check the size of the message, shorten it if
    // it's too big to be appended to the DOM.
    if (program.length > MAX_RESPONSE_LENGTH) {
        program = program.slice(0, MAX_RESPONSE_LENGTH / 2) +
            '\n\n--- THIS RESULT HAS BEEN SHORTENED ---\n\n' +
            program.slice(-MAX_RESPONSE_LENGTH / 2);
    }
    program = program.split(newLineRegex).map(escapeHTML).join('<br />');


    var samp = document.createElement('samp');
    samp.innerHTML = compiler;
    var pre = document.createElement('pre');
    pre.className = 'rustc-output';
    if (!program)
        pre.className += processed.error ? ' rustc-errors' : ' rustc-warnings';
    pre.appendChild(samp);
    activeCode.resultDiv.appendChild(pre);


    if (program) {
        var samp = document.createElement('samp');
        samp.innerHTML = program;
        var pre = document.createElement('pre');
        pre.className = 'output'
        pre.appendChild(samp);
        activeCode.resultDiv.appendChild(pre);
    }
}
