# Overview pictures

`assets/overview-bg.jpg` (PoE1: a ruined cathedral on a sea cliff at dusk) and `assets/overview-bg2.jpg`
(PoE2: a desert temple-pyramid under an eclipse) are painted by code, made for PoE Helper. No game art.

To repaint: load `common.js` then `poe1.js` (or `poe2.js`) in a page with a 1600×700 canvas, call
`paint(canvas.getContext('2d'), 1600, 700)`, and save the canvas as JPEG (quality 0.86).
