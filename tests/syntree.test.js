// Tests for js/syntree.js. Run them with `node --test` from the top folder.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// syntree.js is a browser script that defines globals, so it runs here in a sandbox. Laying out a
// tree only needs a canvas to measure text, so a stand-in gives every character the same width.
const char_width = 7;
const fake_ctx = {
	font: "",
	measureText: (text) => ({ width: String(text).length * char_width }),
};
const sandbox = {
	document: { createElement: () => ({ getContext: () => fake_ctx }) },
	window: { devicePixelRatio: 1 },
};
vm.createContext(sandbox);
const code = fs.readFileSync(path.join(__dirname, "..", "js", "syntree.js"), "utf8");
vm.runInContext(code.replace(/^﻿/, ""), sandbox);
const s = sandbox;

// Parses a tree the way go() does, with siblings linked and problems marked.
function tree(str) {
	const root = s.parse(s.hide_features(str));
	root.set_siblings(null);
	root.check_triangle();
	root.mark_problems();
	return root;
}

function find(node, value) {
	if (node.value == value) return node;
	for (const child of node.children) {
		const res = find(child, value);
		if (res) return res;
	}
	return null;
}

// Draws a tree as SVG with the app's default settings.
function svg(str, term_lines) {
	// Some of the layout reads this from a global the page sets.
	s.vert_space = 50;
	return s.go(str, 12, "12pt serif", "12pt serif", 50, 20, false, !!term_lines, true, true);
}

function svg_height(out) {
	return Number(/^<svg [^>]*height="([\d.]+)"/.exec(out)[1]);
}

// The movement lines in an SVG: where each one starts and ends, and how low it dips.
function movement_curves(out) {
	const curves = [];
	const n = "([\\d.-]+)";
	const re = new RegExp(`<path d="M${n} ${n}Q${n} ${n} ${n} ${n}Q${n} ${n} ${n} ${n}"`, "g");
	let m;
	while ((m = re.exec(out)))
		curves.push({ x1: Number(m[1]), x2: Number(m[9]), bottom: Number(m[4]) });
	return curves;
}

test("parse reads labels, text and children", () => {
	const root = tree("[S [NP Alice] [VP sleeps]]");
	assert.equal(root.value, "S");
	assert.equal(root.children.length, 2);
	assert.equal(root.children[0].value, "NP");
	assert.equal(root.children[0].children[0].value, "Alice");
	assert.equal(root.children[1].children[0].value, "sleeps");
});

test("parse joins the words of a text node with single spaces", () => {
	const root = tree("[NP the\n   big\tdog  barks]");
	assert.equal(root.children[0].value, "the big dog barks");
});

test("parse reads indices and movement labels in either order", () => {
	for (const str of ["[NP_i.a John]", "[NP.a_i John]"]) {
		const root = tree(str);
		assert.equal(root.value, "NP", str);
		assert.equal(root.index, "i", str);
		assert.equal(root.label, "a", str);
	}
	assert.equal(tree("[DP_*i/j him]").index, "*i/j");
});

test("parse reads a movement tail and takes it out of the text", () => {
	const t = tree("[NP t <a>]").children[0];
	assert.equal(t.value, "t");
	assert.equal(t.tail, "a");
});

test("^ draws a triangle over the text", () => {
	const root = tree("[S [NP^ the big dog] [VP sleeps]]");
	const np = root.children[0];
	assert.equal(np.value, "NP");
	assert.ok(np.starred);
	assert.ok(np.children[0].draw_triangle);
	assert.ok(!root.children[1].children[0].draw_triangle);
});

test("features are read in either order and drawn Q first", () => {
	const c = tree("[CP [C_[+finite, -Q] that]]").children[0];
	assert.equal(c.value, "C");
	assert.equal(c.features.Q, "-");
	assert.equal(c.features.finite, "+finite");
	assert.equal(c.index, "[-Q, +finite]");
});

test("features keep the case finite was typed in", () => {
	const c = tree("[CP [C_[-Q, +Finite] that]]").children[0];
	assert.equal(c.index, "[-Q, +Finite]");
});

test("features can have spaces and line breaks in them", () => {
	const c = tree("[CP [C_\n  [ +Q ,\n -finite ] that]]").children[0];
	assert.equal(c.index, "[+Q, -finite]");
	assert.equal(c.children[0].value, "that");
});

test("a feature comes before an index", () => {
	assert.equal(tree("[CP [C_[+Q]_i that]]").children[0].index, "[+Q],i");
});

test("is_embedded skips the C's own C' and CP", () => {
	assert.equal(s.is_embedded([]), false);
	assert.equal(s.is_embedded(["C'", "CP"]), false);
	assert.equal(s.is_embedded(["C'", "CP", "VP"]), true);
});

test("missing_features wants Q always and finite only when embedded", () => {
	assert.deepEqual({ ...s.missing_features(null, false) }, { Q: true, finite: false });
	assert.deepEqual({ ...s.missing_features({ Q: "+" }, false) }, { Q: false, finite: false });
	assert.deepEqual({ ...s.missing_features({ Q: "+" }, true) }, { Q: false, finite: true });
});

test("empty XPs and heads are marked, but an empty X' isn't", () => {
	const root = tree("[S [D ] [N' ] [NP wug]]");
	assert.equal(root.children[0].marked, true);
	assert.equal(root.children[1].marked, false);
	assert.equal(root.children[2].marked, false);
});

test("a C is marked until it has the features it needs", () => {
	assert.equal(tree("[CP [C that]]").children[0].marked, true);
	assert.equal(tree("[CP [C_[+Q] that]]").children[0].marked, false);
	// An embedded C also needs finite.
	const vp = "[VP [V said] [CP [C' [C_[-Q] that]]]]";
	assert.equal(find(tree(vp), "C").marked, true);
	const ok = "[VP [V said] [CP [C' [C_[-Q, +finite] that]]]]";
	assert.equal(find(tree(ok), "C").marked, false);
});

test("marked nodes are drawn in bold", () => {
	const c = tree("[CP [C that]]").children[0];
	assert.equal(c.font("12pt serif", "12pt serif"), "bold 12pt serif");
	assert.equal(c.font("12pt serif", "bold 12pt serif"), "bold 12pt serif");
});

test("a trace t is drawn in italics", () => {
	const t = tree("[NP t]").children[0];
	assert.equal(t.font("12pt serif", "12pt serif"), "italic 12pt serif");
	assert.equal(t.font("italic 12pt serif", "12pt serif"), "italic 12pt serif");
	assert.equal(tree("[NP to]").children[0].font("12pt serif", "12pt serif"), "12pt serif");
});

test("minify_brackets puts the tree on one line", () => {
	const str = "[S\n  [NP Alice]\n  [VP\n    [V sleeps]\n  ]\n]";
	assert.equal(s.minify_brackets(str), "[S [NP Alice] [VP [V sleeps]]]");
});

test("minify_brackets balances brackets and keeps features", () => {
	assert.equal(s.minify_brackets("[S [NP Alice"), "[S [NP Alice]]");
	assert.equal(s.minify_brackets("[CP [C_[+Q] that]]"), "[CP [C_[+Q] that]]");
});

test("format_brackets indents branching nodes and keeps unary ones on one line", () => {
	const out = s.format_brackets("[S [NP [N' [N Alice]]] [VP [V sleeps] [AdvP soundly]]]");
	assert.equal(
		out,
		[
			"[S",
			"  [NP [N' [N Alice]]]",
			"  [VP",
			"    [V sleeps]",
			"    [AdvP soundly]",
			"  ]",
			"]",
		].join("\n")
	);
});

test("format_brackets keeps features on the label's line, filled in or not", () => {
	assert.equal(
		s.format_brackets("[CP [C_[+Q] that] [TP it]]"),
		"[CP\n  [C_[+Q] that]\n  [TP it]\n]"
	);
	assert.equal(
		s.format_brackets("[CP [C_[Q, finite] that] [TP it]]"),
		"[CP\n  [C_[Q, finite] that]\n  [TP it]\n]"
	);
});

test("format_brackets and minify_brackets undo each other", () => {
	const str = "[S [NP^ the dog] [VP [V.a barks] [NP t <a>]]]";
	assert.equal(s.minify_brackets(s.format_brackets(str)), str);
});

test("remove_extra_bars takes out an X' that nothing was adjoined to", () => {
	assert.equal(s.remove_extra_bars("[AdjP [Adj' [Adj' [Adj tall]]]]"), "[AdjP [Adj' [Adj tall]]]");
	assert.equal(s.remove_extra_bars("[VP [V' [V' [V' [V eat]]]]]"), "[VP [V' [V eat]]]");
	assert.equal(s.remove_extra_bars("[V' [V' eat]]"), "[V' eat]");
});

test("remove_extra_bars keeps an X' with an adjunct, and X' over a different X'", () => {
	const adjunct = "[VP [V' [V' [V eat]] [AdvP [Adv' [Adv quickly]]]]]";
	assert.equal(s.remove_extra_bars(adjunct), s.format_brackets(adjunct));
	assert.equal(s.remove_extra_bars("[V' [N' [N dog]]]"), "[V' [N' [N dog]]]");
});

test("remove_extra_bars keeps features and formats the tree", () => {
	assert.equal(
		s.remove_extra_bars("[CP [C' [C' [C_[+Q] that]]]]"),
		"[CP [C' [C_[+Q] that]]]"
	);
	assert.equal(
		s.remove_extra_bars("[DP [D' [D the]] [NP [N' [N' [N dog]]]]]"),
		"[DP\n  [D' [D the]]\n  [NP [N' [N dog]]]\n]"
	);
});

test("go draws a tree as SVG", () => {
	const out = svg("[S [NP Alice] [VP sleeps]]");
	assert.match(out, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
	for (const word of ["S", "NP", "Alice", "VP", "sleeps"])
		assert.match(out, new RegExp(">" + word + "<"));
});

test("go escapes text for SVG", () => {
	assert.match(svg("[S [NP a&b]]"), />a&amp;b</);
});

test("go draws a movement line from a tail to its head", () => {
	const out = svg("[CP [DP.a who] [C' [C_[+Q] did] [VP [V see] [DP t <a>]]]]");
	assert.equal(movement_curves(out).length, 1);
});

test("go doesn't draw a movement line to a head above its tail", () => {
	const out = svg("[VP.a [V see] [DP t <a>]]");
	assert.equal(movement_curves(out).length, 0);
});

test("the image is tall enough for movement lines below the tree", () => {
	const str =
		"[T' [T.b Phóg] [VP [DP^ Máire] [V' [V.a ∅ <b>] " +
		"[VP [V' [V t <a>] [DP^ an lucharachán]]]]]]";
	for (const term_lines of [false, true]) {
		const out = svg(str, term_lines);
		const height = svg_height(out);
		const curves = movement_curves(out);
		assert.equal(curves.length, 2);
		for (const curve of curves)
			assert.ok(curve.bottom < height, curve.bottom + " is below " + height);
	}
});

// The x of a word's text in an SVG.
function text_x(out, word) {
	return Number(new RegExp('<text x="([\\d.]+)"[^>]*>' + word + "<").exec(out)[1]);
}

test("a movement line is centered on a node it has to itself", () => {
	const out = svg("[CP [DP.a who] [C' [C_[+Q] did] [VP [V see] [DP t <a>]]]]");
	const [curve] = movement_curves(out);
	assert.equal(curve.x1, text_x(out, "t"));
	assert.equal(curve.x2, text_x(out, "who"));
});

test("movement lines that meet at the same spot sit side by side", () => {
	// The line into V.a meets it under ∅, where the line out of ∅ starts.
	const out = svg(
		"[T' [T.b Phóg] [VP [DP Máire] [V' [V.a ∅ <b>] [VP [V' [V t <a>] [DP him]]]]]]"
	);
	const null_x = text_x(out, "∅");
	const curves = movement_curves(out);
	const from_t = curves.find((c) => c.x1 == text_x(out, "t"));
	const from_null = curves.find((c) => c.x2 == text_x(out, "Phóg"));
	assert.ok(from_t && from_null, JSON.stringify(curves));
	assert.equal(from_t.x2, null_x + 3);
	assert.equal(from_null.x1, null_x - 3);
});
