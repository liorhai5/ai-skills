# Visible start

<style>
.internal { display: none; }
.concealed { visibility: hidden; }
.visible-child { visibility: visible; }
</style>

<div class="internal">OMIT_DISPLAY <span class="visible-child">OMIT_HIDDEN_SUBTREE</span></div>

<p hidden>OMIT_ATTRIBUTE</p>

<p style="display:none">OMIT_INLINE</p>

<div class="concealed">OMIT_VISIBILITY <!-- OMIT_HIDDEN_COMMENT --><span>OMIT_INHERITED</span><strong class="visible-child">Visible exception</strong></div>

<p style="visibility:collapse">OMIT_COLLAPSED</p>

<table id="visible-table" class="concealed"><tbody><tr class="visible-child"><td>Visible field</td><td>Visible value</td></tr><tr class="visible-child"><td>First column</td><td class="concealed">OMIT_HIDDEN_CELL</td><td>Third column</td></tr></tbody></table>

<ul id="visible-list" class="concealed"><li class="visible-child">Visible bullet</li></ul>

<img style="visibility:hidden" src="./assets/sample.png" alt="OMIT_IMAGE_ALT">

<input style="visibility:hidden" type="text" value="OMIT_CONTROL_VALUE">

Visible **bold** and *italic*: ✓ ⚠ ✕.

1. First item
2. Second item

| Field | Value |
|-------|-------|
| Visible label | Visible value |

![Visible image](./assets/sample.png)

`display: none` and `✓ ⚠ ✕` stay literal in code.

Visible end.
