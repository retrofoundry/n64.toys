use n64_toys_asm::assemble;

fn word(rdram: &[u8], off: usize) -> (u32, u32) {
    (
        u32::from_be_bytes(rdram[off..off + 4].try_into().unwrap()),
        u32::from_be_bytes(rdram[off + 4..off + 8].try_into().unwrap()),
    )
}

#[test]
fn chapel_header_matches_explicit_window_commands() {
    let mut host = String::new();
    let mut expanded = String::from("Gfx chapelWindow[] = {\n");
    for (i, color) in [
        "125,83,92",
        "255,177,79",
        "255,219,138",
        "255,243,197",
        "158,98,101",
        "146,88,101",
    ]
    .iter()
    .enumerate()
    {
        let n = i + 2;
        host.push_str(&format!("Mtx p{n} = identity()\nMtx s{n} = identity()\n"));
        expanded.push_str(&format!("gsSPMatrix(p{n},G_MTX_PUSH)\ngsSPMatrix(s{n},G_MTX_NOPUSH)\ngsDPSetPrimColor(0,0,{color},255)\ngsSPDisplayList(box)\ngsSPPopMatrix(1)\n"));
    }
    expanded.push_str("gsSPEndDisplayList()\n}\nGfx chapelWindows[] = {\n");
    for n in 1..=10 {
        host.push_str(&format!("Mtx chapelWindowAt{n} = identity()\n"));
        expanded.push_str(&format!("gsSPMatrix(chapelWindowAt{n},G_MTX_PUSH)\ngsSPDisplayList(chapelWindow)\ngsSPPopMatrix(1)\n"));
    }
    expanded.push_str("gsSPEndDisplayList()\n}\n");
    host.push_str("Gfx box[] = {\ngsSPEndDisplayList()\n}\ngsSPDisplayList(chapelWindows)\ngsSPEndDisplayList()\n");
    let image = |lists: &str| {
        n64_toys_asm::assemble_at_with_textures(
            &format!("{host}{lists}"),
            0.0,
            &[],
            n64_toys_asm::Microcode::F3dex2,
        )
        .unwrap()
        .rdram
    };
    assert_eq!(
        image(include_str!("scenes/chapel-window.h")),
        image(&expanded)
    );
}

#[test]
fn vertex_sources_resolve_independently_of_cache_slots() {
    let src = "\
Vtx { 9, 0, 0, 0, 0, 0, 0, 0, 0, 255 }
static const Vtx archVerts[] = {
  {{{-80, 13, 0}, 0, {1, 2}, {255, 0, 0, 255}}},
  {{{7, 35, -2}, 0x1234,
    {-64, 32}, {0, 0x80, 255, 255}}}, // second source vertex
};
const Vtx other[] = { {{12, 0, 0}, 0, {0, 0}, {0, 255, 0, 255}} };
Gfx main[] = {
  gsSPVertex(&archVerts[1], 1, 6),
  gsSPVertex(other, 1, 0),
  gsSPVertex(archVerts, 1, 0),
  gsSPVertex(verts, 1, 0),
  gsSPEndDisplayList(),
};
";
    let img = assemble(src).unwrap();
    let entry = img.entry_addr as usize;
    assert_eq!(word(&img.rdram, entry), (0x0100_100e, 48));
    assert_eq!(word(&img.rdram, entry + 8), (0x0100_1002, 64));
    assert_eq!(word(&img.rdram, entry + 16), (0x0100_1002, 32));
    assert_eq!(word(&img.rdram, entry + 24), (0x0100_1002, 16));
    assert_eq!(
        &img.rdram[48..64],
        &[0, 7, 0, 35, 255, 254, 0x12, 0x34, 255, 192, 0, 32, 0, 128, 255, 255]
    );
    assert_eq!(img.source_map[0].1, 9);
}

#[test]
fn bad_vertex_sources_report_the_load_line() {
    for (load, message) in [
        ("gsSPVertex(typo, 1, 0)", "unknown vertex array `typo`"),
        (
            "gsSPVertex(&named[1], 2, 0)",
            "cannot load 2 vertices at index 1",
        ),
        (
            "gsSPVertex(&named[4294967295], 1, 0)",
            "at index 4294967295",
        ),
        ("gsSPVertex(&named[-1], 1, 0)", "nonnegative integer"),
        ("gsSPVertex(verts, 2, 0)", "`verts` (1 vertices)"),
    ] {
        let src = format!("Vtx {{ 0,0,0,0,0,0,0,0,0,0 }}\nVtx named[] = {{ {{0,0,0,0,0,0,0,0,0,0}}, {{0,0,0,0,0,0,0,0,0,0}} }};\n{load}\ngsSPEndDisplayList()");
        let diagnostics = assemble(&src).unwrap_err();
        assert_eq!(diagnostics.len(), 1, "{load}: {diagnostics:?}");
        assert_eq!(diagnostics[0].line, 3);
        assert!(diagnostics[0].msg.contains(message), "{diagnostics:?}");
    }
}

#[test]
fn named_blocks_subdl_and_segment_resolve() {
    // main maps segment 6 -> the `quad` block, then calls it through the segment, then ends.
    let src = "\
Vtx { 0, 0, 0, 0, 0, 0, 255,255,255,255 }
Gfx quad[] = {
  gsSPVertex(verts, 1, 0)
  gsSPEndDisplayList()
}
Gfx main[] = {
  gsSPSegment(6, quad)
  gsSPDisplayList(seg(6, 0))
  gsSPEndDisplayList()
}
";
    let img = assemble(src).expect("assemble");
    // main is laid first (entry right after the data section); `quad` after it, 8-aligned.
    let e = img.entry_addr as usize;
    // main[0] = gsSPSegment(6, quad_addr): w0 = G_MOVEWORD|G_MW_SEGMENT|seg6 = 0xDB06_0018, w1 = quad phys addr.
    let (seg_w0, seg_w1) = word(&img.rdram, e);
    assert_eq!(seg_w0, 0xDB06_0018, "segment w0 (seg index 6 << 2 = 0x18)");
    // main[1] = gsSPDisplayList(seg(6,0)): w0 = 0xDE000000 (call, branch bit clear), w1 = 0x06000000.
    let (dl_w0, dl_w1) = word(&img.rdram, e + 8);
    assert_eq!(dl_w0, 0xDE00_0000);
    assert_eq!(dl_w1, 0x0600_0000);
    // The segment base (seg_w1) is the physical address of the `quad` block (8-aligned, past main).
    assert!(seg_w1 > img.entry_addr, "quad block laid after main");
    assert_eq!(seg_w1 % 8, 0, "block 8-aligned");
}

#[test]
fn paren_aware_seg_operand_with_offset() {
    let src = "\
Gfx main[] = {
  gsSPDisplayList(seg(6, 16))
  gsSPEndDisplayList()
}
";
    let img = assemble(src).expect("assemble");
    let (_w0, w1) = word(&img.rdram, img.entry_addr as usize);
    assert_eq!(w1, 0x0600_0010, "(6<<24)|16");
}

#[test]
fn tri2_and_popmatrix_author_through_assembler() {
    let src = "\
Vtx { 0, 0, 0, 0, 0, 0, 255,255,255,255 }
Mtx m = identity()
Gfx main[] = {
  gsSPMatrix(m, G_MTX_MODELVIEW | G_MTX_LOAD | G_MTX_PUSH)
  gsSP2Triangles(0, 1, 2, 0, 0, 2, 3, 0)
  gsSPPopMatrix(2)
  gsSPEndDisplayList()
}
";
    let img = assemble(src).expect("assemble");
    let e = img.entry_addr as usize;
    // [1] = gsSP2Triangles(0,1,2,0,0,2,3,0) -> (0x06000204, 0x00000406).
    assert_eq!(word(&img.rdram, e + 8), (0x0600_0204, 0x0000_0406));
    assert_eq!(word(&img.rdram, e + 16), (0xD838_0002, 0x0000_0080));
}

#[test]
fn flat_source_still_assembles_as_implicit_main() {
    // No Gfx[] block: top-level commands form the implicit `main` (entry right after data).
    let src = "\
Vtx { 0, 0, 0, 0, 0, 0, 255,255,255,255 }
gsSPVertex(verts, 1, 0)
gsSPEndDisplayList()
";
    let img = assemble(src).expect("assemble");
    // entry is the first command (a G_VTX, opcode 0x01).
    let (w0, _w1) = word(&img.rdram, img.entry_addr as usize);
    assert_eq!(w0 >> 24, 0x01, "implicit-main entry is the G_VTX");
}

#[test]
fn branchlist_authors_to_branch_word() {
    // gsSPBranchList(sub) -> w0=0xDE010000 (branch bit set), w1=sub block phys addr.
    let src = "\
Gfx sub[] = {
  gsSPEndDisplayList()
}
Gfx main[] = {
  gsSPBranchList(sub)
}
";
    let img = assemble(src).expect("assemble");
    let (w0, w1) = word(&img.rdram, img.entry_addr as usize);
    assert_eq!(w0, 0xDE01_0000, "branch bit set");
    assert!(
        w1 > img.entry_addr && w1 % 8 == 0,
        "sub block laid after main, 8-aligned"
    );
}

#[test]
fn unknown_block_symbol_is_diagnosed() {
    // `verts` in gsSPVertex is a fixed pool placeholder (ignored), NOT a resolved symbol; the
    // error here is the gsSPDisplayList target `nope`.
    let src = "\
Gfx main[] = {
  gsSPDisplayList(nope)
  gsSPEndDisplayList()
}
";
    let err = assemble(src).expect_err("should error on unknown symbol");
    assert!(
        err.iter().any(|d| d.msg.contains("unknown symbol")),
        "{err:?}"
    );
}

#[test]
fn error_in_main_with_following_block_returns_err_without_panic() {
    // A diagnosed error in main (a non-last block) must not trip the layout debug_assert when
    // emitting the following `tail` block — assemble returns Err cleanly. (See Step 6 guard.)
    let src = "\
Gfx main[] = {
  gsSPDisplayList(nope)
  gsSPEndDisplayList()
}
Gfx tail[] = {
  gsSPEndDisplayList()
}
";
    let err = assemble(src).expect_err("should error");
    assert!(
        err.iter().any(|d| d.msg.contains("unknown symbol")),
        "{err:?}"
    );
}
