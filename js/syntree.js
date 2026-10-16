// MIT license

var debug = true;
var margin = 15; // Number of pixels from tree to edge on each side.
var padding_above_text = 6; // Lines will end this many pixels above text.
var padding_below_text = 6;

function TreeNode() {
	this.value = null;
	this.step = null; // Horizontal distance between children.
	this.draw_triangle = null;
	this.label = null; // Head of movement.
	this.tail = null; // Tail of movement.
	this.max_y = null; // Distance of the descendent of this node that is farthest from root.
	this.children = new Array();
	this.has_children;
	this.first = null;
	this.last = null;
	this.parent = null;
	this.next = null;
	this.previous = null;
	this.x = null; // Where the node will eventually be drawn.
	this.y = null;
	this.head_chain = null;
	this.tail_chain = null;
	this.starred = null;
}

TreeNode.prototype.set_siblings = function (parent) {
	for (var i = 0; i < this.children.length; i++) this.children[i].set_siblings(this);

	this.has_children = this.children.length > 0;
	this.parent = parent;

	if (this.has_children) {
		this.first = this.children[0];
		this.last = this.children[this.children.length - 1];
	}

	for (var i = 0; i < this.children.length - 1; i++) this.children[i].next = this.children[i + 1];

	for (var i = 1; i < this.children.length; i++) this.children[i].previous = this.children[i - 1];
};

TreeNode.prototype.check_triangle = function () {
	this.draw_triangle = 0;
	if (!this.has_children && this.parent && this.parent.starred) this.draw_triangle = 1;

	for (var child = this.first; child != null; child = child.next) child.check_triangle();
};

TreeNode.prototype.set_width = function (ctx, vert_space, hor_space, term_font, nonterm_font) {
	ctx.font = term_font;
	if (this.has_children) ctx.font = nonterm_font;

	var val_width = ctx.measureText(this.value).width;

	for (var child = this.first; child != null; child = child.next)
		child.set_width(ctx, vert_space, hor_space, term_font, nonterm_font);

	if (!this.has_children) {
		this.left_width = val_width / 2;
		this.right_width = val_width / 2;
		return;
	}

	// Figure out how wide apart the children should be placed.
	// The spacing between them should be equal.
	this.step = 0;
	for (var child = this.first; child != null && child.next != null; child = child.next) {
		var space = child.right_width + hor_space + child.next.left_width;
		this.step = Math.max(this.step, space);
	}

	this.left_width = 0.0;
	this.right_width = 0.0;

	if (this.has_children) {
		var sub = ((this.children.length - 1) / 2) * this.step;
		this.left_width = sub + this.first.left_width;
		this.right_width = sub + this.last.right_width;
	}

	this.left_width = Math.max(this.left_width, val_width / 2);
	this.right_width = Math.max(this.right_width, val_width / 2);
};

TreeNode.prototype.find_height = function () {
	this.max_y = this.y;
	for (var child = this.first; child != null; child = child.next)
		this.max_y = Math.max(this.max_y, child.find_height());
	return this.max_y;
};

TreeNode.prototype.assign_location = function (x, y, font_size, term_lines) {
	// floor + 0.5 for antialiasing
	this.x = Math.floor(x) + 0.5;
	this.y = Math.floor(y) + 0.5;

	if (this.has_children) {
		var left_start = x - this.step * ((this.children.length - 1) / 2);
		for (var i = 0; i < this.children.length; i++)
			this.children[i].assign_location(
				left_start + i * this.step,
				y + vert_space,
				font_size,
				term_lines
			);
	} else {
		if (this.parent && !term_lines && this.parent.children.length == 1 && !this.draw_triangle)
			this.y = this.parent.y + padding_above_text + padding_below_text + font_size;
	}
};

TreeNode.prototype.draw = function (ctx, font_size, term_font, nonterm_font, color, term_lines) {
	ctx.font = term_font;
	if (this.has_children) ctx.font = nonterm_font;

	ctx.fillStyle = "black";
	if (color) {
		ctx.fillStyle = "green";
		if (this.has_children) ctx.fillStyle = "blue";
	}

	ctx.fillText(this.value, this.x, this.y);
	for (var child = this.first; child != null; child = child.next)
		child.draw(ctx, font_size, term_font, nonterm_font, color, term_lines);

	if (!this.parent) return;

	if (this.draw_triangle) {
		ctx.moveTo(this.parent.x, this.parent.y + padding_below_text);
		ctx.lineTo(this.x - this.left_width, this.y - font_size - padding_above_text);
		ctx.lineTo(this.x + this.right_width, this.y - font_size - padding_above_text);
		ctx.lineTo(this.parent.x, this.parent.y + padding_below_text);
		ctx.stroke();
		return;
	}

	if (!this.has_children && !term_lines && this.parent.children.length == 1) return;

	ctx.moveTo(this.parent.x, this.parent.y + padding_below_text);
	ctx.lineTo(this.x, this.y - font_size - padding_above_text);
	ctx.stroke();
};

TreeNode.prototype.find_head = function (label) {
	for (var child = this.first; child != null; child = child.next) {
		var res = child.find_head(label);
		if (res != null) return res;
	}

	if (this.label == label) return this;
	return null;
};

TreeNode.prototype.find_movement = function (mlarr, root) {
	for (var child = this.first; child != null; child = child.next)
		child.find_movement(mlarr, root);

	if (this.tail != null) {
		var m = new MovementLine();
		m.tail = this;
		m.head = root.find_head(this.tail);
		mlarr.push(m);
	}
};

TreeNode.prototype.reset_chains = function () {
	this.head_chain = null;
	this.tail_chain = null;

	for (var child = this.first; child != null; child = child.next) child.reset_chains();
};

TreeNode.prototype.find_intervening_height = function (leftwards) {
	var max_y = this.y;

	var n = this;
	while (true) {
		if (leftwards) {
			n = n.previous;
		} else {
			n = n.next;
		}
		if (!n) break;
		if (n.head_chain || n.tail_chain) return max_y;
		max_y = Math.max(max_y, n.max_y);
	}

	max_y = Math.max(max_y, this.parent.find_intervening_height(leftwards));
	return max_y;
};

function MovementLine() {
	this.head = null;
	this.tail = null;
	this.lca = null;
	this.dest_x = null;
	this.dest_y = null;
	this.bottom_y = null;
	this.max_y = null;
	this.should_draw = null;
	this.leftwards = null;
}

MovementLine.prototype.set_up = function () {
	this.should_draw = 0;
	if (this.tail == null || this.head == null) return;

	// Check to see if head is parent of tail,
	if (!this.check_head()) return;

	// Find the last common ancestor.
	this.find_lca();
	if (this.lca == null) return;

	// Find out the greatest intervening height.
	this.find_intervening_height();

	this.dest_x = this.head.x;
	this.dest_y = this.head.max_y;
	this.bottom_y = this.max_y + vert_space;
	this.should_draw = 1;
	return;
};

MovementLine.prototype.check_head = function () {
	var n = this.tail;
	n.tail_chain = 1;
	while (n.parent != null) {
		n = n.parent;
		if (n == this.head) return 0;
		n.tail_chain = 1;
	}
	return 1;
};

MovementLine.prototype.find_lca = function () {
	var n = this.head;
	n.head_chain = 1;
	this.lca = null;
	while (n.parent != null) {
		n = n.parent;
		n.head_chain = 1;
		if (n.tail_chain) {
			this.lca = n;
			break;
		}
	}
};

MovementLine.prototype.find_intervening_height = function () {
	for (var child = this.lca.first; child != null; child = child.next) {
		if (child.head_chain || child.tail_chain) {
			this.leftwards = false;
			if (child.head_chain) this.leftwards = true;
			break;
		}
	}

	this.max_y = Math.max(
		this.tail.find_intervening_height(this.leftwards),
		this.head.find_intervening_height(!this.leftwards),
		this.head.max_y
	);
};

MovementLine.prototype.draw = function (ctx) {
	var tail_x = this.tail.x + 3;
	this.dest_x -= 3;
	if (this.leftwards) {
		tail_x -= 6;
		this.dest_x += 6;
	}

	ctx.moveTo(tail_x, this.tail.y + padding_below_text);
	ctx.quadraticCurveTo(tail_x, this.bottom_y, (tail_x + this.dest_x) / 2, this.bottom_y);
	ctx.quadraticCurveTo(this.dest_x, this.bottom_y, this.dest_x, this.dest_y + padding_below_text);
	ctx.stroke();
	// Arrowhead
	ctx.beginPath();
	ctx.lineTo(this.dest_x + 3, this.dest_y + padding_below_text + 10);
	ctx.lineTo(this.dest_x - 3, this.dest_y + padding_below_text + 10);
	ctx.lineTo(this.dest_x, this.dest_y + padding_below_text);
	ctx.closePath();
	ctx.fillStyle = "#000000";
	ctx.fill();
};

// Stands in for a canvas context and records what is drawn as SVG, so the SVG comes from the
// same layout and drawing code as the PNG. It supports only the calls this file makes.
function SvgContext(width, height) {
	this.width = width;
	this.height = height;
	this.parts = [];
	this.path = "";
	this.dx = 0;
	this.dy = 0;
	this.font = "10px sans-serif";
	this.fillStyle = "#000000";
	this.strokeStyle = "#000000";
	this.textAlign = "start";
}

function svg_escape(str) {
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

SvgContext.prototype.point = function (x, y) {
	return x + this.dx + " " + (y + this.dy);
};

SvgContext.prototype.translate = function (x, y) {
	this.dx += x;
	this.dy += y;
};

SvgContext.prototype.fillRect = function (x, y, w, h) {
	this.parts.push(
		'<rect x="' +
			(x + this.dx) +
			'" y="' +
			(y + this.dy) +
			'" width="' +
			w +
			'" height="' +
			h +
			'" fill="' +
			svg_escape(this.fillStyle) +
			'"/>'
	);
};

SvgContext.prototype.fillText = function (text, x, y) {
	var anchor = { center: "middle", right: "end", end: "end" }[this.textAlign] || "start";
	this.parts.push(
		'<text x="' +
			(x + this.dx) +
			'" y="' +
			(y + this.dy) +
			'" text-anchor="' +
			anchor +
			'" fill="' +
			svg_escape(this.fillStyle) +
			'" style="font: ' +
			svg_escape(this.font) +
			'" xml:space="preserve">' +
			svg_escape(text) +
			"</text>"
	);
};

SvgContext.prototype.beginPath = function () {
	this.path = "";
};

SvgContext.prototype.moveTo = function (x, y) {
	this.path += "M" + this.point(x, y);
};

// As on a canvas, a line with no starting point just sets one.
SvgContext.prototype.lineTo = function (x, y) {
	this.path += (this.path ? "L" : "M") + this.point(x, y);
};

SvgContext.prototype.quadraticCurveTo = function (cx, cy, x, y) {
	this.path += "Q" + this.point(cx, cy) + " " + this.point(x, y);
};

SvgContext.prototype.closePath = function () {
	this.path += "Z";
};

// The drawing code strokes without starting new paths, which a canvas tolerates by
// stroking the same lines again. Here each stroke or fill takes only what was drawn since.
SvgContext.prototype.stroke = function () {
	if (!this.path) return;
	this.parts.push(
		'<path d="' + this.path + '" fill="none" stroke="' + svg_escape(this.strokeStyle) + '"/>'
	);
	this.path = "";
};

SvgContext.prototype.fill = function () {
	if (!this.path) return;
	this.parts.push('<path d="' + this.path + '" fill="' + svg_escape(this.fillStyle) + '"/>');
	this.path = "";
};

SvgContext.prototype.to_svg = function () {
	return (
		'<svg xmlns="http://www.w3.org/2000/svg" width="' +
		this.width +
		'" height="' +
		this.height +
		'" viewBox="0 0 ' +
		this.width +
		" " +
		this.height +
		'">' +
		this.parts.join("") +
		"</svg>"
	);
};

// Returns the tree as a PNG image, or with as_svg as the text of an SVG file.
function go(
	str,
	font_size,
	term_font,
	nonterm_font,
	vert_space,
	hor_space,
	color,
	term_lines,
	as_svg
) {
	// Clean up the string
	str = str.replace(/^\s+/, "");
	var open = 0;
	for (var i = 0; i < str.length; i++) {
		if (str[i] == "[") open++;
		if (str[i] == "]") open--;
	}
	while (open < 0) {
		str = "[" + str;
		open++;
	}
	while (open > 0) {
		str = str + "]";
		open--;
	}

	var root = parse(str);
	root.set_siblings(null);
	root.check_triangle();

	var canvas;
	var ctx;

	try {
		// Make a new canvas. Required for IE compatability.
		canvas = document.createElement("canvas");
		ctx = canvas.getContext("2d");
	} catch (err) {
		throw "canvas";
	}

	// Find out dimensions of the tree.
	root.set_width(ctx, vert_space, hor_space, term_font, nonterm_font);
	root.assign_location(0, 0, font_size, term_lines);
	root.find_height();

	var movement_lines = new Array();
	root.find_movement(movement_lines, root);
	for (var i = 0; i < movement_lines.length; i++) {
		root.reset_chains();
		movement_lines[i].set_up();
	}

	// Set up the canvas.
	var width = root.left_width + root.right_width + 2 * margin;
	var height = root.max_y + font_size + 2 * margin;
	// Problem: movement lines may protrude from bottom.
	for (var i = 0; i < movement_lines.length; i++)
		if (movement_lines[i].max_y == root.max_y) {
			height += vert_space;
			break;
		}

	canvas.id = "canvas";
	canvas.width = width;
	canvas.height = height;
	if (as_svg) ctx = new SvgContext(width, height);
	ctx.fillStyle = "rgb(255, 255, 255)";
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = "rgb(0, 0, 0)";
	ctx.textAlign = "center";
	var x_shift = Math.floor(root.left_width + margin);
	var y_shift = Math.floor(font_size + margin);
	ctx.translate(x_shift, y_shift);

	root.draw(ctx, font_size, term_font, nonterm_font, color, term_lines);
	for (var i = 0; i < movement_lines.length; i++)
		if (movement_lines[i].should_draw) movement_lines[i].draw(ctx);

	if (as_svg) return ctx.to_svg();
	// Swap out the image
	return Canvas2Image.saveAsPNG(canvas, true);
}

function subscriptify(in_str) {
	var out_str = "";
	for (var i = 0; i < in_str.length; ++i) {
		switch (in_str[i]) {
			case "0":
				out_str = out_str + "₀";
				break;
			case "1":
				out_str = out_str + "₁";
				break;
			case "2":
				out_str = out_str + "₂";
				break;
			case "3":
				out_str = out_str + "₃";
				break;
			case "4":
				out_str = out_str + "₄";
				break;
			case "5":
				out_str = out_str + "₅";
				break;
			case "6":
				out_str = out_str + "₆";
				break;
			case "7":
				out_str = out_str + "₇";
				break;
			case "8":
				out_str = out_str + "₈";
				break;
			case "9":
				out_str = out_str + "₉";
				break;
		}
	}
	return out_str;
}

function parse(str) {
	var n = new TreeNode();

	if (str[0] != "[") {
		// Text node
		// Get any movement information.
		// Make sure to collapse any spaces around <X> to one space, even if there is no space.
		str = str.replace(/\s*<(\w+)>\s*/, function (match, tail) {
			n.tail = tail;
			return " ";
		});
		str = str.replace(/^\s+/, "");
		str = str.replace(/\s+$/, "");
		str = str.replace(/\s*[\r\n\t]\s*/g, " ");
		n.value = str;
		return n;
	}

	var i = 1;
	while (i < str.length && !/[\s\[\]]/.test(str[i])) i++;
	n.value = str.substr(1, i - 1);
	n.value = n.value.replace(/\^/, function () {
		n.starred = true;
		return "";
	});
	n.value = n.value.replace(/_(\w+)$/, function (match, label) {
		n.label = label;
		if (n.label.search(/^\d+$/) != -1) return subscriptify(n.label);
		return "";
	});

	while (/\s/.test(str[i])) i++;
	if (str[i] != "]") {
		var level = 1;
		var start = i;
		for (; i < str.length; i++) {
			var temp = level;
			if (str[i] == "[") level++;
			if (str[i] == "]") level--;
			if ((temp == 1 && level == 2) || (temp == 1 && level == 0)) {
				if (str.substring(start, i).search(/[^\s]/) > -1)
					n.children.push(parse(str.substring(start, i)));
				start = i;
			}
			if (temp == 2 && level == 1) {
				n.children.push(parse(str.substring(start, i + 1)));
				start = i + 1;
			}
		}
	}
	return n;
}

// Parse bracket notation loosely into a list of top-level nodes and text,
// balancing any unmatched brackets first.
function read_brackets(str) {
	str = str.replace(/^\s+/, "");
	var open = 0;
	for (var i = 0; i < str.length; i++) {
		if (str[i] == "[") open++;
		if (str[i] == "]") open--;
	}
	while (open < 0) {
		str = "[" + str;
		open++;
	}
	while (open > 0) {
		str = str + "]";
		open--;
	}

	var pos = 0;

	function read_text() {
		var start = pos;
		while (pos < str.length && str[pos] != "[" && str[pos] != "]") pos++;
		return str.substring(start, pos).replace(/\s+/g, " ").replace(/^ | $/g, "");
	}

	function read_node() {
		pos++;
		var start = pos;
		while (pos < str.length && !/[\s\[\]]/.test(str[pos])) pos++;
		var node = { label: str.substring(start, pos), children: [] };
		while (pos < str.length) {
			if (str[pos] == "]") {
				pos++;
				break;
			}
			if (str[pos] == "[") {
				node.children.push(read_node());
				continue;
			}
			var text = read_text();
			if (text != "") node.children.push(text);
		}
		return node;
	}

	var parts = [];
	while (pos < str.length) {
		if (str[pos] == "[") {
			parts.push(read_node());
		} else {
			var text = read_text();
			if (text != "") parts.push(text);
			if (str[pos] == "]") pos++;
		}
	}
	return parts;
}

function format_brackets(str, indent_unit) {
	if (indent_unit == null) indent_unit = "  ";

	function write_node(node, indent) {
		var has_phrase = false;
		for (var i = 0; i < node.children.length; i++)
			if (typeof node.children[i] != "string") has_phrase = true;

		var out = "[" + node.label;
		if (!has_phrase) {
			if (node.children.length > 0) out += " " + node.children.join(" ");
			return out + "]";
		}
		var inner = indent + indent_unit;
		for (var i = 0; i < node.children.length; i++) {
			var child = node.children[i];
			out += "\n" + inner + (typeof child == "string" ? child : write_node(child, inner));
		}
		return out + "\n" + indent + "]";
	}

	return read_brackets(str)
		.map(function (part) {
			return typeof part == "string" ? part : write_node(part, "");
		})
		.join("\n");
}

// Put the whole tree on one line, e.g. "[S [NP This] [VP [V is] [^NP a wug]]]".
function minify_brackets(str) {
	function write_node(node) {
		var out = "[" + node.label;
		for (var i = 0; i < node.children.length; i++) {
			var child = node.children[i];
			out += " " + (typeof child == "string" ? child : write_node(child));
		}
		return out + "]";
	}

	return read_brackets(str)
		.map(function (part) {
			return typeof part == "string" ? part : write_node(part);
		})
		.join(" ");
}
