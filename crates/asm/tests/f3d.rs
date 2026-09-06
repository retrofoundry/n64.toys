use n64_toys_asm::{analyze, assemble_at_with_textures, Microcode};

fn assemble(source: &str) -> n64_toys_asm::Image {
    assemble_at_with_textures(source, 0.0, &[], Microcode::F3d).unwrap()
}

fn words(image: &n64_toys_asm::Image) -> Vec<(u32, u32)> {
    image.rdram[image.entry_addr as usize..]
        .chunks_exact(8)
        .map(|word| {
            (
                u32::from_be_bytes(word[..4].try_into().unwrap()),
                u32::from_be_bytes(word[4..].try_into().unwrap()),
            )
        })
        .collect()
}

#[test]
fn default_microcode_is_f3dex2() {
    assert_eq!(Microcode::default(), Microcode::F3dex2);
}

#[test]
fn f3d_emits_target_specific_rsp_words() {
    let source = "\
Mtx m = identity()
Vtx { 0,0,0,0,0,0,0,0,0,0 }
Vtx { 0,0,0,0,0,0,0,0,0,0 }
Vtx { 0,0,0,0,0,0,0,0,0,0 }
gsSPMatrix(m, G_MTX_PROJECTION | G_MTX_LOAD | G_MTX_PUSH)
gsSPViewport(vp)
gsSPSetGeometryMode(G_SHADING_SMOOTH | G_CULL_BACK | 0x40)
gsSPClearGeometryMode(G_CULL_FRONT)
gsSPVertex(verts, 3, 1)
gsSP1Triangle(1, 2, 3, 0)
gsSP2Triangles(1,2,3,0, 3,2,1,0)
gsSPSegment(2, 0x123456)
gsSPFogPosition(10, 100)
gsSPPopMatrix(2)
gsSPEndDisplayList()
";
    let image = assemble(source);
    let actual = words(&image);
    let expected = vec![
        (
            0x0107_0000,
            image.rdram.len() as u32 - actual.len() as u32 * 8 - 64,
        ),
        (0x0380_0000, image.vp_addr),
        (0xB700_0000, 0x0000_2240),
        (0xB600_0000, 0x0000_1000),
        (0x0421_0000, image.vtx_addr),
        (0xBF00_0000, 0x000A_141E),
        (0xBF00_0000, 0x000A_141E),
        (0xBF00_0000, 0x001E_140A),
        (0xBC00_0806, 0x0012_3456),
        (0xBC00_0008, 0x058E_0571),
        (0xBD00_0000, 0),
        (0xBD00_0000, 0),
        (0xB800_0000, 0),
    ];
    assert_eq!(actual, expected);
}

#[test]
fn f3d_pop_expansion_controls_block_addresses_and_source_map() {
    let source = "\
Gfx sub[] = {
  gsSPPopMatrix(0)
  gsSPPopMatrix(1)
  gsSPPopMatrix(2)
  gsSPEndDisplayList()
}
Gfx main[] = {
  gsSPDisplayList(sub)
  gsSPBranchList(sub)
}
";
    let image = assemble(source);
    let stream = words(&image);
    assert_eq!(stream[0], (0x0600_0000, image.entry_addr + 16));
    assert_eq!(stream[1], (0x0601_0000, image.entry_addr + 16));
    assert_eq!(
        &stream[2..],
        &[
            (0xBD00_0000, 0),
            (0xBD00_0000, 0),
            (0xBD00_0000, 0),
            (0xB800_0000, 0)
        ]
    );
    assert_eq!(
        image
            .source_map
            .iter()
            .map(|(_, line)| *line)
            .collect::<Vec<_>>(),
        [8, 9, 3, 4, 4, 5]
    );
}

#[test]
fn f3d_rejects_operands_before_narrowing_in_assembly_and_analysis() {
    for line in [
        "gsSPVertex(v, 0, 0)",
        "gsSPVertex(v, 16, 1)",
        "gsSPVertex(v, 4294967297, 0)",
        "gsSPVertex(v, -4294967296, 0)",
        "gsSP1Triangle(0, 15, 16, 0)",
        "gsSP1Triangle(0, 1, 4294967296, 0)",
        "gsSP2Triangles(0,1,2,0, 3,4,-1,0)",
    ] {
        let source = format!("{line}\ngsSPEndDisplayList()\n");
        assert!(
            !analyze(&source, Microcode::F3d).diagnostics.is_empty(),
            "{line}"
        );
        assert!(
            assemble_at_with_textures(&source, 0.0, &[], Microcode::F3d).is_err(),
            "{line}"
        );
    }
}

#[test]
fn f3dex2_keeps_permissive_operand_behavior() {
    let source = "gsSPVertex(v, 17, 250)\ngsSP1Triangle(16,17,18,0)\ngsSPEndDisplayList()\n";
    assert!(analyze(source, Microcode::F3dex2).diagnostics.is_empty());
    assert!(assemble_at_with_textures(source, 0.0, &[], Microcode::F3dex2).is_ok());
}

#[test]
fn f3d_texrect_uses_original_continuation_opcodes() {
    for name in ["gsSPTextureRectangle", "gsSPTextureRectangleFlip"] {
        let source = format!("{name}(0,0,4,4,0,0,0,1024,1024)\ngsSPEndDisplayList()\n");
        let stream = words(&assemble(&source));
        let header = if name.ends_with("Flip") {
            0xE500_4004
        } else {
            0xE400_4004
        };
        assert_eq!(
            &stream[..3],
            &[(header, 0), (0xB400_0000, 0), (0xB300_0000, 0x0400_0400)]
        );
    }
}

#[test]
fn huge_f3d_pop_fails_before_emission() {
    let error = assemble_at_with_textures("gsSPPopMatrix(4294967295)\n", 0.0, &[], Microcode::F3d)
        .unwrap_err();
    assert!(error.iter().any(|diag| diag.msg.contains("address space")));
}

#[test]
fn f3d_loads_seven_lights_and_ambient_with_original_selectors() {
    let source = "\
Lights l = { dir(1,0,0) col(1,2,3); dir(0,1,0) col(4,5,6); dir(0,0,1) col(7,8,9); dir(-1,0,0) col(10,11,12); dir(0,-1,0) col(13,14,15); dir(0,0,-1) col(16,17,18); dir(1,1,1) col(19,20,21); ambient(22,23,24) }
gsSPSetLights(l)
gsSPEndDisplayList()
";
    let image = assemble(source);
    let stream = words(&image);
    assert_eq!(stream[0], (0xBC00_0002, 0x8000_0100));
    for slot in 0..8u32 {
        assert_eq!(
            stream[slot as usize + 1],
            (
                0x0300_0000 | ((0x86 + slot * 2) << 16),
                image.light_addr + slot * 16
            )
        );
    }
    assert_eq!(stream[9], (0xB800_0000, 0));
    assert_eq!(
        &image.rdram[image.light_addr as usize + 7 * 16..image.light_addr as usize + 7 * 16 + 7],
        &[22, 23, 24, 0, 22, 23, 24]
    );
}

#[test]
fn f3d_rejects_more_than_seven_lights_during_analysis() {
    let source = "Lights l = { dir(1,0,0) col(1,1,1); dir(1,0,0) col(1,1,1); dir(1,0,0) col(1,1,1); dir(1,0,0) col(1,1,1); dir(1,0,0) col(1,1,1); dir(1,0,0) col(1,1,1); dir(1,0,0) col(1,1,1); dir(1,0,0) col(1,1,1); ambient(0,0,0) }\ngsSPSetLights(l)\n";
    assert!(analyze(source, Microcode::F3d)
        .diagnostics
        .iter()
        .any(|diag| diag.msg.contains("at most 7")));
}

#[test]
fn f3d_emits_texture_and_othermode_words() {
    let source = "\
gsSPTexture(0x1234, 0x5678, 2, 3, G_ON)
gsDPSetOtherMode_H(4, 5, 0x1234)
gsDPSetOtherMode_H(G_CYC_2CYCLE)
gsDPSetOtherMode_L(3, 29, 0x1234)
gsDPSetRenderMode(0x11, 0x22)
gsSPEndDisplayList()
";
    assert_eq!(
        words(&assemble(source)),
        [
            (0xBB00_1301, 0x1234_5678),
            (0xBA00_0405, 0x0000_1234),
            (0xBA00_1402, 0x0010_0000),
            (0xB900_031D, 0x0000_1234),
            (0xB900_031D, 0x0000_0033),
            (0xB800_0000, 0),
        ]
    );
}

#[test]
fn f3d_emits_lookat_selectors_and_perspective_normalize() {
    let source = "\
Mtx p = perspective(60, 1, 10, 100, 1)
LookAt la = lookat_reflect(0,0,10, 0,0,0, 0,1,0)
gsSPPerspNormalize(p)
gsSPLookAt(la)
gsSPEndDisplayList()
";
    let image = assemble(source);
    assert_eq!(
        words(&image),
        [
            (0xBC00_000E, 0x0000_04A7),
            (0x0384_0000, image.lookat_addr),
            (0x0382_0000, image.lookat_addr + 16),
            (0xB800_0000, 0),
        ]
    );
}

#[test]
fn f3d_accepts_vertex_cache_boundaries() {
    for command in [
        "gsSPVertex(v, 16, 0)",
        "gsSPVertex(v, 1, 15)",
        "gsSP1Triangle(15,15,15,0)",
    ] {
        let source = format!("{command}\ngsSPEndDisplayList()\n");
        assert!(analyze(&source, Microcode::F3d).diagnostics.is_empty());
    }
}

#[test]
fn geometry_names_are_target_specific_and_numeric_masks_stay_literal() {
    let source = "gsSPSetGeometryMode(G_SHADING_SMOOTH | G_CULL_FRONT | 0x200)\ngsSPClearGeometryMode(G_SHADING_SMOOTH | G_CULL_FRONT | 0x200)\n";
    assert_eq!(
        words(&assemble(source)),
        [(0xB700_0000, 0x0000_1200), (0xB600_0000, 0x0000_1200)]
    );
    let image = assemble_at_with_textures(source, 0.0, &[], Microcode::F3dex2).unwrap();
    assert_eq!(
        words(&image),
        [(0xD9FF_FFFF, 0x0020_0200), (0xD9DF_FDFF, 0)]
    );
}
