// this is mostly the editor implemented by @SergioBenitez for graydon/rust-www
// plus small modifications to accommodate a "Reset" button

// ECMAScript 6 Backwards compatability
if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function(str, pos) {
        pos = pos || 0;
        return this.slice(pos, str.length) === str;
    };
}

var THEMES = ["tomorrow", "solarized_light", "tomorrow_night"];

// Regex for finding new lines
var newLineRegex = /(?:\r\n|\r|\n)/g;

// DOM items
var editorDiv;
var resetButton;
var runButton;
var resultDiv;

// Background colors for program result on success/error
var successColor = "#E2EEF6";
var errorColor = "#F6E2E2";
var warningColor = "#FFFBCB";

// Error message to return when there's a server failure
var errMsg = "The server encountered an error while running the program.";

// Stores ACE editor markers (highights) for errors
var markers = [];

// Status codes, because there are no enums in Javascript
var SUCCESS = 0;
var ERROR = 1;
var WARNING = 2;

const Range = ace.require('ace/range').Range;

// Ace editor
var editor;

// Original source code
var originalCode;

// Maximum length of a response before it has to be truncated
var MAX_RESPONSE_LENGTH = 50000;

// Get the theme from number from a classList
function getTheme(classList) {
    for (var entry of classList.values()) {
        if (entry.startsWith("color-theme-"))
            return parseInt(entry.slice("color-theme-".length), 10);
    }
    return 0
}

// Create a marker, returns the plugin marker ID, not the Ace marker ID
function createMarker(category, start_line, start_col, end_line, end_col) {
    var r = new Range(); // Creates a range with undefined values.
    r.start = editor.session.doc.createAnchor(start_line, start_col);
    r.end = editor.session.doc.createAnchor(end_line, end_col);
    var id = editor.session.addMarker(r, "ace-" + category + "-text", "text", false);
    var marker = {
        range: r,
        id: id,
        category: category
    };
    id = markers.length;
    markers.push(marker);
    return id;
}

// Set the highlight mode of a marker, takes the plugin marker ID, not the Ace marker ID
function highlightMarker(id, highlight) {
    var marker = markers[id];
    editor.session.removeMarker(marker.id);
    highlight = highlight ? "highlight-" : "";
    marker.id = editor.session.addMarker(marker.range, "ace-" + highlight + marker.category + "-text", "text", false);
    editor.scrollToLine(Math.round((marker.range.start.row + marker.range.end.row) / 2) - 1, true, true);
}

// Moves the cursor to a marker, takes the plugin marker ID, not the Ace marker ID
function focusMarker(id) {
    var marker = markers[id];
    editor.focus();
    editor.scrollToLine(marker.range.start.row - 1, true, true);
    editor.selection.clearSelection();
    editor.selection.moveCursorTo(marker.range.start.row - 1, marker.range.start.column - 1, false);
}

// Removes all the markers
function clearMarkers() {
    for (let marker of markers) {
        marker.range.end.detach();
        marker.range.start.detach();
        editor.session.removeMarker(marker.id);
    }
    markers = []
}

function initEditor() {
    // Fetching DOM items
    editorDiv = document.getElementById("editor");
    resetButton = document.getElementById("reset-code");
    runButton = document.getElementById("run-code");
    resultDiv = document.getElementById("result");

    // No editor on this page
    if (editorDiv === null) return;

    // Watch the book so we can change themes
    var book = document.querySelector("div.book");
    const MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    if (MutationObserver) {
        var observer = new MutationObserver(mutations =>
            mutations.forEach(e => {
                if (e.attributeName !== "class") return;
                var nextTheme = getTheme(book.classList)
                if (nextTheme === theme) return;
                theme = nextTheme;
                editor.setTheme("ace/theme/" + themes[theme])
            })
        );

        observer.observe(book, {
            subtree: false,
            attributes: true
        });
    }

    // Setup ace editor
    editor = ace.edit("editor");

    theme = getTheme(book.classList);
    editor.setTheme("ace/theme/" + THEMES[theme])
    editor.session.setMode("ace/mode/rust");
    editor.setShowPrintMargin(false);
    editor.renderer.setShowGutter(false);
    editor.setHighlightActiveLine(false);
    editor.commands.addCommand({
        name: "run",
        bindKey: {
            win: "Ctrl-Enter",
            mac: "Ctrl-Enter"
        },
        exec: executeCode
    })

    originalCode = editor.session.getValue();

    // Set initial size to match initial content
    updateEditorHeight();

    // Registering handler for run button click
    runButton.addEventListener("click", executeCode);

    // Registering handler for reset button click
    resetButton.addEventListener("click", (ev) => {
        // Clear previous markers, if any
        clearMarkers()

        editor.session.setValue(originalCode);
        resultDiv.style.display = "none";
    });

    editor.on('change', updateEditorHeight);

    // Highlight active line when focused
    editor.on('focus', () => editor.setHighlightActiveLine(true));

    // Don't when not
    editor.on('blur', () => editor.setHighlightActiveLine(false));
}

require(["gitbook"], gitbook => {

    // Init configuration at start
    gitbook.events.bind('start', (e, config) => {
        var opts = config["gitbook-plugin-rust-playpen"];
        THEMES = opts.themes;
        for (const theme of THEMES) {
            ace.require("ace/theme/" + theme);
        }
    });

    gitbook.events.bind("page.change", initEditor)
});

// Changes the height of the editor to match its contents
function updateEditorHeight() {
    // http://stackoverflow.com/questions/11584061/
    var newHeight = editor.session.getScreenLength() *
        editor.renderer.lineHeight +
        editor.renderer.scrollBar.getWidth();

    editorDiv.style.height = Math.ceil(newHeight).toString() + "px";
    editor.resize();
};

//
// escapeHTML() borrowed from mustache.js:
// https://github.com/janl/mustache.js/blob/master/mustache.js#L43
//
// via:
// http://stackoverflow.com/questions/24816/escaping-html-strings-with-jquery/12034334#12034334
//
var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

function escapeHTML(unsafe) {
    return String(unsafe).replace(/[&<>"'\/]/g, s => entityMap[s]);
}

const COLOR_CODES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

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
        .replace(/\x1b\[1m\x1b\[3([0-7])m([^\x1b]*)(?:\x1b\(B)?\x1b\[0?m/g, (original, colorCode, text) => '<span class=ansi-' + COLOR_CODES[+colorCode] + '><strong>' + text + '</strong></span>')
        .replace(/\x1b\[3([0-7])m([^\x1b]*)(?:\x1b\(B)?\x1b\[0?m/g, (original, colorCode, text) => '<span class=ansi-' + COLOR_CODES[+colorCode] + '>' + text + '</span>')
        .replace(/\x1b\[1m([^\x1b]*)(?:\x1b\(B)?\x1b\[0?m/g, (original, text) => "<strong>" + text + "</strong>")
        .replace(/(?:\x1b\(B)?\x1b\[0m/g, '');
}

function formatCompilerOutput(text) {
    var output = "";
    for (let [i, line] of text.split(newLineRegex).entries()) {
        line = JSON.parse(line);
        if (line.rendered) {
            var span_id = 0;
            output += ansi2html(line.rendered)
                .replace(/<strong>error\[(E\d\d\d\d)\]<\/strong>/g, (text, code) => "<strong>error[<a href=https://doc.rust-lang.org/error-index.html#" + code + " target=_blank>" + code + "</a>]</strong>")
                .replace(/^  <span class="ansi-blue"><strong>--&gt; <\/strong><\/span>&lt;.*?&gt;:\d+:\d+$/mg, (text) => {
                    var span = line.spans[span_id]
                    span_id++;
                    return "  <span class=\"ansi-blue\"><strong>--&gt; </strong></span><a onclick=\"javascript:focusMarker(" +
                        id + ")\" onmouseover=\"javascript:highlightMarker(" +
                        id + ",true)\" onmouseout=\"javascript:highlightMarker(" +
                        id + ", false)\" class=\"linejump\">" + escapeHTML(span.file_name) + ":" + span.line_start + ":" + span.column_start + "</a>"
                });
            continue
        }

        var color = "";
        switch (line.level) {
            case "error":
                color = " class=\"ansi-red\"";
                break;
            case "warning":
                color = " class=\"ansi-yellow\"";
                break;
        }


        output += "<span" + color + "><strong>" + line.level;
        if (line.code && line.code.code) {
            output += "[<a href=\"https://doc.rust-lang.org/error-index.html#" + line.code.code + "\" target=\"_blank\">" + line.code.code + "</a>]";
        }
        output += "</strong></span><strong>: " + line.message + "</strong>";

        for (let span of line.spans) {
            var spaces = " ".repeat(span.line_start.toString().length);
            var id = createMarker(line.level, span.line_start - 1, span.column_start - 1, span.line_end - 1, span.column_end - 1);
            output += "\n" + spaces + "<span class=\"ansi-blue\"><strong>--&gt; </strong></span><a onclick=\"javascript:focusMarker(" +
                id + ")\" onmouseover=\"javascript:highlightMarker(" +
                id + ",true)\" onmouseout=\"javascript:highlightMarker(" +
                id + ", false)\" class=\"linejump\">" + escapeHTML(span.file_name) + ":" + span.line_start + ":" + span.column_start + "</a>" +
                "\n" + spaces + " <span class=\"ansi-blue\"><strong>|</strong></span>";
            for (let [line_number, text] of span.text) {
                line_number += span.line_start;
                var highlight_spaces = ;
                var highlight
                output += "\n" + "<span class=\"ansi-blue\"><strong>" + line_number + " | </strong></span> " + text.text +
                    "\n" + spaces + " <span class=\"ansi-blue\"><strong>| </strong></span>" + " ".repeat(text.highlight_start) + "<span" + color + "><strong>" + "^".repeat(text.highlight_end - text.highlight_start) + "</strong></span><span" + color + "><strong> " + span.label + "</strong></span>";
            }
            output += "\n" + spaces + " <span class=\"ansi-blue\"><strong>|</strong></span>";
        }
        for (let child of lines.children) {
            var ccolor = "";
            switch (child.level) {
                case "error":
                    ccolor = " class=\"ansi-red\"";
                    break;
                case "warning":
                    ccolor = " class=\"ansi-yellow\"";
                    break;
            }

            output += "\n" + spaces + " <span class=\"ansi-blue\"><strong>= </strong></span><span" + ccolor + "><strong>" + child.level;
            if (child.code && child.code.code) {
                output += "[<a href=\"https://doc.rust-lang.org/error-index.html#" + child.code.code + "\" target=\"_blank\">" + child.code.code + "</a>]";
            }
            output += "</strong></span><strong>: " + child.message + "</strong>";
        }
        output += "\n";
    }
}

function executeCode() {
    resultDiv.style.display = "block";
    resultDiv.innerHTML = "Running...";

    // Clear previous markers
    clearMarkers();

    // Get the code, run the program
    var program = editor.getValue();
    runProgram(program, handleResult);
};

// Dispatches a XMLHttpRequest to the Rust playpen, running the program, and
// issues a callback to `callback` with the result (or null on error)
function runProgram(program, callback) {
    var req = new XMLHttpRequest();
    var data = JSON.stringify({
        version: "stable",
        optimize: "0",
        separate_output: true,
        color: true,
        code: program,
        json_format: true
    });

    // console.log("Sending", data);
    req.open('POST', "https://play.rust-lang.org/evaluate.json", true);
    req.onload = function(e) {
        if (req.readyState === 4 && req.status === 200) {
            var response = JSON.parse(req.response);
            if (response.rustc && response.program) {
                return callback({
                    compiler: response.rustc,
                    program: response.program
                });
            }
        }
        callback();
    };

    req.onerror = function(e) {
        callback();
    }

    req.setRequestHeader("Content-Type", "application/json");
    req.send(data);
}

// The callback to runProgram
function handleResult(result) {
    // Clear out the result content
    resultDiv.textContent = "";

    // If we got here from some unknown error, just bail
    if (result === undefined) {
        var samp = document.createElement("samp");
        samp.innerHTML = errMsg;
        var pre = document.createElement("pre");
        pre.className = "rustc-output rustc-errors"
        pre.appendChild(samp);
        resultDiv.appendChild(pre);
        return;
    }

    var compiler = result.compiler || "";
    var program = result.program || "";

    // Unpack the compiler output from the json format
    compiler = processCompilerOutput(compiler);

    // Check the size of the message, shorten it if
    // it's too big to be appended to the DOM.
    if (program.length > MAX_RESPONSE_LENGTH) {
        program = program.slice(0, MAX_RESPONSE_LENGTH / 2) +
            '\n\n--- THIS RESULT HAS BEEN SHORTENED ---\n\n' +
            program.slice(-MAX_RESPONSE_LENGTH / 2);
    }
    program = program.split(newLineRegex).map(escapeHTML).join('<br />');


    var samp = document.createElement("samp");
    samp.innerHTML = compiler;
    var pre = document.createElement("pre");
    if (statusCode == SUCCESS) {
        pre.className = "rustc-output"
    } else if (statusCode == WARNING) {
        pre.className = "rustc-output rustc-warnings";
    } else {
        pre.className = "rustc-output rustc-errors";
    }
    pre.appendChild(samp);
    resultDiv.appendChild(pre);


    var samp = document.createElement("samp");
    samp.innerHTML = program;
    var pre = document.createElement("pre");
    pre.className = "output"
    pre.appendChild(samp);
    resultDiv.appendChild(pre);
}
