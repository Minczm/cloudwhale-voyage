/*
 * Scene layout shared by js/main.js (the page) and tools/composite_preview.py
 * (the Pillow preview). Everything between the BEGIN/END markers must stay
 * strict JSON so Python can parse it.
 *
 * Coordinates are in a 1920x1080 design frame.
 *   fit "cover": image covers the whole viewport (+ parallax margin), "focus" = object-position.
 *   fit "place": image placed at x/y with width w; "anchor" = which viewport point the design
 *                frame is pinned to when the window is not 16:9 (like background-position %).
 *   fit "tile" : horizontally tiled seamless strip, top y, height h, scrolls at "speed" design px/s.
 *   parallax   : multiplier of the global parallax amplitude (far = small, near = large).
 *   intro      : fade-in delay in ms for the entrance sequence.
 *   keepLeftOfUI: (landscape) shrink/shift the layer so at most this fraction of the UI column's
 *                width is covered (narrow windows such as 4:3 / 5:4).
 *   portrait   : stacked layout (aspect <= 1 or width <= 760px): "slot" = fit into that element's
 *                rect; "fitW"/"maxH" = size as fractions of the viewport, pinned to the anchor corner.
 *   glows      : warm light points in the layer image (fractions of the image), animated by main.js.
 */
window.CW_SCENE = /*BEGIN*/{
  "design": { "w": 1920, "h": 1080, "minVisibleW": 1280, "minVisibleH": 780 },
  "parallaxAmp": { "x": 64, "y": 30 },
  "layers": [
    { "id": "sky",         "file": "L0_sky",         "z": 0, "fit": "cover", "focus": [0.3, 0.45],
      "blend": "normal", "opacity": 1.0,  "parallax": 0.04, "intro": 0 },
    { "id": "far-islands", "file": "L1_far_islands", "z": 1, "fit": "place", "x": 0, "y": 380, "w": 1920,
      "anchor": [0.5, 1.0], "blend": "normal", "opacity": 0.92, "parallax": 0.10, "intro": 700 },
    { "id": "clouds-far",  "file": "L2_clouds_far",  "z": 2, "fit": "tile", "y": 330, "h": 910,
      "anchor": [0.5, 1.0], "blend": "screen", "opacity": 0.9, "parallax": 0.16, "speed": 5, "intro": 900 },
    { "id": "whale",       "file": "L3_whale",       "z": 3, "fit": "place", "x": 480, "y": 200, "w": 880,
      "anchor": [0.9, 0.42], "blend": "normal", "opacity": 1.0, "parallax": 0.26, "intro": 1500,
      "keepLeftOfUI": 0.25, "portrait": { "slot": ".whale-slot", "fill": 0.94 } },
    { "id": "clouds-near", "file": "L4_clouds_near", "z": 4, "fit": "tile", "y": 560, "h": 644,
      "anchor": [0.5, 1.0], "blend": "screen", "opacity": 0.85, "parallax": 0.42, "speed": 13, "intro": 2100 },
    { "id": "foreground",  "file": "L5_foreground",  "z": 5, "fit": "place", "x": -30, "y": 540, "w": 520,
      "anchor": [0.0, 1.0], "blend": "normal", "opacity": 1.0, "parallax": 0.62, "intro": 2300,
      "portrait": { "fitW": 0.40, "maxH": 0.30 } },
    { "id": "light",       "file": "L6_light",       "z": 6, "fit": "cover", "focus": [0.0, 0.0],
      "blend": "screen", "opacity": 0.55, "parallax": 0.2, "intro": 2800 }
  ],
  "emblem": { "file": "L7_emblem", "previewBox": [1460, 70, 200, 0] },
  "glows": [
    {"layer": "foreground", "kind": "lantern", "x": 0.8709, "y": 0.2871, "r": 0.11},
    {"layer": "whale", "kind": "twinkle", "x": 0.396, "y": 0.216, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.4138, "y": 0.2572, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.4865, "y": 0.286, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.4596, "y": 0.1595, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.5501, "y": 0.3302, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.3752, "y": 0.2181, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.4342, "y": 0.2634, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.5719, "y": 0.2315, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.3294, "y": 0.284, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.6884, "y": 0.2726, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.7743, "y": 0.4053, "r": 0.012},
    {"layer": "whale", "kind": "twinkle", "x": 0.302, "y": 0.286, "r": 0.012}
  ]
}/*END*/;
