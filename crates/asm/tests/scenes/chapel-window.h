#define WINDOW_PART(pos, scale, r, g, b) \
    gsSPMatrix(&(pos), G_MTX_MODELVIEW | G_MTX_MUL | G_MTX_PUSH), \
    gsSPMatrix(&(scale), G_MTX_MODELVIEW | G_MTX_MUL | G_MTX_NOPUSH), \
    gsDPSetPrimColor(0, 0, r, g, b, 255), \
    gsSPDisplayList(box), \
    gsSPPopMatrix(G_MTX_MODELVIEW)

static Gfx chapelWindow[] = {
    WINDOW_PART(p2, s2, 125, 83, 92),
    WINDOW_PART(p3, s3, 255, 177, 79),
    WINDOW_PART(p4, s4, 255, 219, 138),
    WINDOW_PART(p5, s5, 255, 243, 197),
    WINDOW_PART(p6, s6, 158, 98, 101),
    WINDOW_PART(p7, s7, 146, 88, 101),
    gsSPEndDisplayList(),
};

#define PLACE(matrix, list) \
    gsSPMatrix(&(matrix), G_MTX_MODELVIEW | G_MTX_MUL | G_MTX_PUSH), \
    gsSPDisplayList(list), \
    gsSPPopMatrix(G_MTX_MODELVIEW)

static Gfx chapelWindows[] = {
    PLACE(chapelWindowAt1, chapelWindow),
    PLACE(chapelWindowAt2, chapelWindow),
    PLACE(chapelWindowAt3, chapelWindow),
    PLACE(chapelWindowAt4, chapelWindow),
    PLACE(chapelWindowAt5, chapelWindow),
    PLACE(chapelWindowAt6, chapelWindow),
    PLACE(chapelWindowAt7, chapelWindow),
    PLACE(chapelWindowAt8, chapelWindow),
    PLACE(chapelWindowAt9, chapelWindow),
    PLACE(chapelWindowAt10, chapelWindow),
    gsSPEndDisplayList(),
};
