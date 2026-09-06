use crate::asm::{assemble, assemble_with_texture, Image};

const SRC: &str = "\
Mtx p = scale(0.015625)
Mtx m = identity()
Vp { 640, 480, 511, 511, 320, 240, 0, 511 }
Vtx { -48, -48, 0, 0, 0, 0, 255, 0, 0, 255 }
Vtx {  48, -48, 0, 0, 0, 0, 0, 255, 0, 255 }
Vtx {   0,  48, 0, 0, 0, 0, 0, 0, 255, 255 }
gsSPMatrix(p, G_MTX_PROJECTION | G_MTX_LOAD | G_MTX_NOPUSH)
gsSPMatrix(m, G_MTX_MODELVIEW | G_MTX_LOAD | G_MTX_NOPUSH)
gsSPViewport(vp)
gsSPClearGeometryMode(G_LIGHTING, G_CULL_BACK)
gsSPSetGeometryMode(G_SHADE, G_SHADING_SMOOTH)
gsSPVertex(verts, 3, 0)
gsSP1Triangle(0, 1, 2, 0)
gsSPEndDisplayList()
";

const SOURCE_MAP_SRC: &str = "\
Mtx p = scale(0.015625)
Mtx m = identity()
Vp { 640, 480, 511, 0, 640, 480, 511, 0 }
Vtx { -48, -48, 0, 0, 0, 0, 255, 0, 0, 255 }
Vtx {  48, -48, 0, 0, 0, 0, 0, 255, 0, 255 }
Vtx {   0,  48, 0, 0, 0, 0, 0, 0, 255, 255 }

gsSPMatrix(p, G_MTX_PROJECTION | G_MTX_LOAD | G_MTX_NOPUSH)
gsSPMatrix(m, G_MTX_MODELVIEW | G_MTX_LOAD | G_MTX_NOPUSH)
gsSPViewport(vp)
gsSPSetGeometryMode(G_SHADE | G_SHADING_SMOOTH)
gsDPSetRenderMode(G_RM_OPA_SURF, G_RM_OPA_SURF2)
gsDPSetCombineLERP(0, 0, 0, SHADE, 0, 0, 0, SHADE, 0, 0, 0, SHADE, 0, 0, 0, SHADE)
gsSPVertex(verts, 3, 0)
gsSP1Triangle(0, 1, 2, 0)
gsSPEndDisplayList()
";

#[test]
fn parser_accepts_gsdp_set_render_mode_preset() {
    let img = crate::asm::assemble(
        "gsDPSetRenderMode(G_RM_AA_ZB_OPA_SURF, G_RM_AA_ZB_OPA_SURF2)\ngsSPEndDisplayList()",
    )
    .expect("assemble");

    assert_eq!(img.rdram[img.entry_addr as usize], 0xE2);
}

#[test]
fn source_map_tracks_command_lines_and_excludes_data() {
    let img = crate::asm::assemble_at_with_textures(
        SOURCE_MAP_SRC,
        0.0,
        &[],
        crate::Microcode::default(),
    )
    .expect("assemble");
    assert_eq!(img.source_map.len(), 9);
    assert_eq!(img.rdram.len() - img.entry_addr as usize, 9 * 8);
    for (index, line) in (8..=16).enumerate() {
        let addr = img.entry_addr + index as u32 * 8;
        assert_eq!(img.source_map[index], (addr, line));
        assert_eq!(img.line_at(u64::from(addr)), Some(line));
    }
    assert_eq!(img.line_at(u64::from(img.vtx_addr)), None);
    assert_eq!(img.line_at(u64::from(img.vp_addr)), None);
    assert_eq!(img.line_at(u64::from(img.entry_addr) + 4), None);
    assert_eq!(img.line_at(img.rdram.len() as u64), None);
    assert_eq!(img.line_at((1u64 << 32) + u64::from(img.entry_addr)), None);
    assert_eq!(img.line_at(u64::MAX), None);
}

#[test]
fn source_map_tracks_every_texture_macro_word() {
    for (format, gbi_format, size, words) in [("RGBA16", "RGBA", "16b", 7), ("CI8", "CI", "8b", 11)]
    {
        let source = format!(
            "Texture tex = {{ 2, 2, {format} }}\n\n\
gsDPLoadTextureBlock(tex, G_IM_FMT_{gbi_format}, G_IM_SIZ_{size}, 2, 2)\n\
gsSPEndDisplayList()\n"
        );
        let rgba8 = [255; 16];
        let img = crate::asm::assemble_at_with_textures(
            &source,
            0.0,
            &[crate::asm::TextureInput {
                name: "tex",
                rgba8: &rgba8,
                width: 2,
                height: 2,
            }],
            crate::Microcode::default(),
        )
        .expect("assemble texture macro");
        assert_eq!(img.source_map.len(), words + 1, "{format}");
        assert_eq!(img.rdram.len() - img.entry_addr as usize, (words + 1) * 8);
        for index in 0..words {
            let addr = img.entry_addr + index as u32 * 8;
            assert_eq!(img.source_map[index], (addr, 3));
            assert_eq!(img.line_at(u64::from(addr)), Some(3));
        }
        assert_eq!(
            img.source_map[words],
            (img.entry_addr + words as u32 * 8, 4)
        );
        assert_eq!(img.line_at(u64::from(img.tex_addr)), None);
    }
}

#[test]
fn source_map_tracks_named_blocks_in_address_order() {
    let source = "\
Gfx sub[] = {
  gsSPSetGeometryMode(G_SHADE | G_SHADING_SMOOTH)
  gsSPEndDisplayList()
}
Gfx main[] = {
  gsSPDisplayList(sub)
  gsSPEndDisplayList()
}
";
    let img = assemble(source).expect("assemble named blocks");
    assert_eq!(img.source_map.len(), 4);
    for (index, line) in [6, 7, 2, 3].into_iter().enumerate() {
        let addr = img.entry_addr + index as u32 * 8;
        assert_eq!(img.source_map[index], (addr, line));
        assert_eq!(img.line_at(u64::from(addr)), Some(line));
    }
    assert_eq!(img.line_at(u64::from(img.entry_addr)), Some(6));
}

#[test]
fn assembles_minimal_dl_layout() {
    let img: Image = assemble(SRC).expect("assemble ok");

    assert_eq!(img.rdram.len() % 8, 0);
    assert!(img.rdram.len() >= 192);
    let e = img.entry_addr as usize;
    assert_eq!(e % 8, 0);
    let cmds = &img.rdram[e..];
    assert_eq!(cmds.len() % 8, 0);
    assert_eq!(cmds[0], 0xDA);
    let last_w0_off = cmds.len() - 8;
    assert_eq!(cmds[last_w0_off], 0xDF);

    let mut found_vp = false;
    let mut off = 0usize;
    while off < cmds.len() {
        if cmds[off] == 0xDC {
            let w1 =
                u32::from_be_bytes([cmds[off + 4], cmds[off + 5], cmds[off + 6], cmds[off + 7]]);
            assert_eq!(w1, img.vp_addr);
            found_vp = true;
        }
        off += 8;
    }
    assert!(found_vp);
}

#[test]
fn first_matrix_command_is_projection_with_length_field() {
    let img = assemble(SRC).expect("assemble ok");
    let e = img.entry_addr as usize;
    let w0 = u32::from_be_bytes([
        img.rdram[e],
        img.rdram[e + 1],
        img.rdram[e + 2],
        img.rdram[e + 3],
    ]);

    assert_eq!(w0, 0xDA38_0007);
}

#[test]
fn unknown_matrix_name_is_diagnosed() {
    let bad = "\
// unknown-matrix fixture
Mtx p = identity()
Vtx { 0, 0, 0, 0, 0, 0, 0, 0, 0, 255 }
gsSPMatrix(zzz, G_MTX_PROJECTION | G_MTX_LOAD | G_MTX_NOPUSH)
gsSPEndDisplayList()
";
    let err = assemble(bad).unwrap_err();
    assert_eq!(err.len(), 1);
    assert_eq!(err[0].line, 4);
    assert!(err[0].msg.contains("zzz"));
}

#[test]
fn assemble_surfaces_parse_diagnostics() {
    let err = assemble("gsSPBogus()\n").unwrap_err();
    assert_eq!(err.len(), 1);
    assert_eq!(err[0].line, 1);
}

#[test]
fn ci8_assembles_palette_and_loadtlut_command() {
    let src_n64 = "\
Texture tex = { 3, 1, CI8 }
gsDPLoadTextureBlock(tex, G_IM_FMT_CI, G_IM_SIZ_8b, 3, 1)
gsSPEndDisplayList()
";

    let rgba = [0u8, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255];
    let img = assemble_with_texture(src_n64, &rgba, 3, 1)
        .expect("CI8 assembly must succeed for 3 distinct colors");

    let ta = img.tex_addr as usize;
    assert_eq!(&img.rdram[ta..ta + 3], &[0u8, 1, 2], "CI8 index bytes");

    let pal_base = ta + 8;

    assert_eq!(img.rdram[pal_base], 0x00, "palette[0] hi");
    assert_eq!(img.rdram[pal_base + 1], 0x01, "palette[0] lo");

    assert_eq!(img.rdram[pal_base + 2], 0xF8, "palette[1] hi");
    assert_eq!(img.rdram[pal_base + 3], 0x01, "palette[1] lo");

    assert_eq!(img.rdram[pal_base + 4], 0x07, "palette[2] hi");
    assert_eq!(img.rdram[pal_base + 5], 0xC1, "palette[2] lo");

    let e = img.entry_addr as usize;
    let mut found_tlut = false;
    let mut off = e;
    while off + 8 <= img.rdram.len() {
        let w0 = u32::from_be_bytes(img.rdram[off..off + 4].try_into().unwrap());
        if w0 >> 24 == 0xF0 {
            found_tlut = true;
            break;
        }
        if w0 >> 24 == 0xDF {
            break;
        }
        off += 8;
    }
    assert!(
        found_tlut,
        "G_LOADTLUT (opcode 0xF0) not found in display list"
    );
}

#[test]
fn ci4_pair_packs_high_nibble_even() {
    let pal = [[0, 0, 0, 255u8], [255, 0, 0, 255]];
    let src = [255, 0, 0, 255, 0, 0, 0, 255];
    let packed = crate::asm::encode_ci4(&src, &pal);
    assert_eq!(packed, vec![0x10]);
}

#[test]
fn ci4_assembles_palette_and_loadtlut_command() {
    let src_n64 = "\
Texture tex = { 2, 1, CI4 }
gsDPLoadTextureBlock(tex, G_IM_FMT_CI, G_IM_SIZ_4b, 2, 1)
gsSPEndDisplayList()
";

    let rgba = [0u8, 0, 0, 255, 255, 0, 0, 255];
    let img = assemble_with_texture(src_n64, &rgba, 2, 1)
        .expect("CI4 assembly must succeed for 2 distinct colors");

    let ta = img.tex_addr as usize;
    assert_eq!(img.rdram[ta], 0x01, "CI4 packed byte: black=0 hi, red=1 lo");

    let pal_base = ta + 8;

    assert_eq!(img.rdram[pal_base], 0x00, "CI4 palette[0] hi (black)");
    assert_eq!(img.rdram[pal_base + 1], 0x01, "CI4 palette[0] lo (alpha=1)");

    assert_eq!(img.rdram[pal_base + 2], 0xF8, "CI4 palette[1] hi (red)");
    assert_eq!(img.rdram[pal_base + 3], 0x01, "CI4 palette[1] lo (alpha=1)");

    let e = img.entry_addr as usize;
    let mut found_tlut = false;
    let mut off = e;
    while off + 8 <= img.rdram.len() {
        let w0 = u32::from_be_bytes(img.rdram[off..off + 4].try_into().unwrap());
        if w0 >> 24 == 0xF0 {
            found_tlut = true;
            break;
        }
        if w0 >> 24 == 0xDF {
            break;
        }
        off += 8;
    }
    assert!(
        found_tlut,
        "G_LOADTLUT (opcode 0xF0) not found in CI4 display list"
    );
}

#[test]
fn source_map_resolves_missing_render_mode_command_address() {
    let source = SOURCE_MAP_SRC.replace("gsDPSetRenderMode(G_RM_OPA_SURF, G_RM_OPA_SURF2)", "");
    let image =
        crate::assemble_at_with_textures(&source, 0.0, &[], crate::Microcode::default()).unwrap();
    assert_eq!(image.line_at(u64::from(image.entry_addr) + 7 * 8), Some(16));
}

#[test]
fn ia16_white_preserves_intensity_and_alpha() {
    assert_eq!(
        crate::asm::encode_ia16_texel(255, 255, 255, 128),
        [255, 128]
    );
}

#[test]
fn ia8_mid_gray_packs_intensity_and_alpha() {
    assert_eq!(crate::asm::encode_ia8_texel(128, 128, 128, 192), 0x8C);
}

#[test]
fn ci8_encodes_palette_indices() {
    let pal = [[0, 0, 0, 255], [255, 0, 0, 255], [0, 255, 0, 255]];
    let src = [0u8, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255];
    assert_eq!(crate::asm::encode_ci8(&src, &pal), vec![0, 1, 2]);
}

#[test]
fn morphcube_references_time() {
    assert!(
        crate::analyze(
            include_str!("../tests/scenes/morphcube.n64"),
            crate::Microcode::default()
        )
        .references_time
    );
}

#[test]
fn perspective_cube_references_time() {
    assert!(
        crate::analyze(
            include_str!("../tests/scenes/perspective-cube.n64"),
            crate::Microcode::default()
        )
        .references_time
    );
}
