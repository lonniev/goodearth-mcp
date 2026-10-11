"""Bed layouts inside a plot: one solver, a generator per style.

`transform.propose` reads a plot's outline and returns variants of child
beds, writing nothing. Every style shares the frame, the quality gate, the
paths-as-negative-space inset and the naming; only the generator differs.
The method and its constants were measured on a hand-built 35-bed layout in
Cottage Garden (11 October 2026) — see the Brain note "Generating Bed Layouts
Inside a Plot".
"""
