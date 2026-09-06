use super::*;
const STARTER: &str = include_str!("../../../../web-app/src/lib/docs/starter.n64");

#[test]
fn starter_both_targets_and_times() {
    for target in ["F3DEX2", "F3D"] {
        let rest = capture(STARTER, 0.0, &[], target);
        let moving = capture(STARTER, 1.37, &[], target);
        for trace in [&rest, &moving] {
            assert!(trace.error.is_none());
            assert_eq!(trace.termination, "end");
            assert_eq!(trace.rows.len(), 10);
            assert_eq!(
                trace
                    .rows
                    .iter()
                    .map(|r| r.line.unwrap())
                    .collect::<Vec<_>>(),
                (19..=28).collect::<Vec<_>>()
            );
            assert_eq!(trace.rows[8].decoded.mnemonic, "G_TRI1");
            assert!(
                matches!(&trace.rows[8].draws[0], Draw::Triangles { indices, material_index: 0, .. } if indices.len() == 3)
            );
            assert!(trace
                .rows
                .iter()
                .enumerate()
                .all(|(i, r)| i == 8 || r.draws.is_empty()));
            assert_eq!(trace.source_lines.len(), 10);
            assert_eq!(trace.rows[8].state, trace.rows[9].state);
        }
        assert_ne!(
            rest.states[rest.rows[1].state].modelview,
            moving.states[moving.rows[1].state].modelview
        );
        assert_eq!(
            rest.rows.iter().map(|r| &r.pc).collect::<Vec<_>>(),
            moving.rows.iter().map(|r| &r.pc).collect::<Vec<_>>()
        );
    }
}

#[test]
fn sublists_have_execution_identity() {
    let source = include_str!("../../../asm/tests/scenes/segmented-sub-dl.n64");
    let rgba = vec![255; 32 * 32 * 4];
    let textures = [n64_toys_asm::TextureInput {
        name: "tex",
        rgba8: &rgba,
        width: 32,
        height: 32,
    }];
    let trace = capture(source, 0.0, &textures, "F3DEX2");
    assert!(trace.error.is_none());
    let rows: Vec<_> = trace.rows.iter().filter(|r| r.line == Some(13)).collect();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].pc, rows[1].pc);
    assert_ne!(rows[0].seq, rows[1].seq);
    assert!(rows.iter().all(|r| r.depth_before == 1));
    assert_eq!(
        trace.source_lines.iter().filter(|l| l.line == 13).count(),
        1
    );
}

#[test]
fn multipass_and_continuations() {
    let source = include_str!("../../../asm/tests/scenes/offscreen-then-sample.n64");
    for target in ["F3DEX2", "F3D"] {
        let trace = capture(source, 0.0, &[], target);
        assert!(trace.error.is_none());
        let draws: Vec<_> = trace.rows.iter().flat_map(|r| &r.draws).collect();
        assert!(
            matches!(draws[0], Draw::FillRect { target, .. } if target.color_image.addr == "0x00200000")
        );
        assert!(
            matches!(draws[1], Draw::TexRect { target, fb_source: Some(src), .. } if target.color_image.addr == "0x00100000" && src == "0x00200000")
        );
        let rect = trace
            .rows
            .iter()
            .find(|r| r.decoded.mnemonic == "G_TEXRECT")
            .unwrap();
        assert_eq!(rect.words.len(), 3);
        assert!(rect.words.iter().all(|w| w.line == rect.line));
    }
}

#[test]
fn exact_mapping_and_bounds_without_invented_rows() {
    let source = "gsSPTextureRectangle(0, 0, 4, 4, 0, 0, 0, 1024, 1024)\ngsSPEndDisplayList()";
    let mut image = n64_toys_asm::assemble(source).unwrap();
    let entry = u64::from(image.entry_addr);
    image
        .source_map
        .retain(|(pc, _)| u64::from(*pc) != entry + 8);
    let mut c = Collector {
        image: &image,
        microcode: n64_toys_asm::Microcode::F3dex2,
        rows: vec![],
        states: vec![],
        lines: BTreeSet::new(),
        stop_after: None,
    };
    inspect::walk(
        fast3d::RdramImage::new(&image.rdram),
        entry,
        fast3d::Microcode::F3dex2,
        fast3d::DataFormat::Fixed,
        &mut c,
    );
    assert_eq!(c.rows[0].words[1].line, None);
    let mut c = Collector {
        image: &image,
        microcode: n64_toys_asm::Microcode::F3dex2,
        rows: vec![],
        states: vec![],
        lines: BTreeSet::new(),
        stop_after: None,
    };
    let summary = inspect::walk(
        fast3d::RdramImage::new(&[]),
        entry,
        fast3d::Microcode::F3dex2,
        fast3d::DataFormat::Fixed,
        &mut c,
    );
    assert_eq!(termination(summary.termination), "bounds");
    assert!(c.rows.is_empty());
}

#[test]
fn cap_cancellation_and_errors() {
    let source = "Gfx main[] = {\n gsSPBranchList(main)\n}";
    let trace = capture(source, 0.0, &[], "F3DEX2");
    assert!(trace.error.is_none());
    assert_eq!(trace.termination, "cap");
    assert_eq!(trace.dispatched, inspect::MAX_DISPATCHES);
    assert_eq!(trace.states.len(), 1);
    let image = n64_toys_asm::assemble(source).unwrap();
    let mut c = Collector {
        image: &image,
        microcode: n64_toys_asm::Microcode::F3dex2,
        rows: vec![],
        states: vec![],
        lines: BTreeSet::new(),
        stop_after: Some(2),
    };
    let summary = inspect::walk(
        fast3d::RdramImage::new(&image.rdram),
        u64::from(image.entry_addr),
        fast3d::Microcode::F3dex2,
        fast3d::DataFormat::Fixed,
        &mut c,
    );
    assert_eq!(termination(summary.termination), "stopped");
    assert_eq!(c.rows.len(), 2);
    assert!(capture(STARTER, 0.0, &[], "unknown")
        .error
        .unwrap()
        .contains("unknown microcode"));
    let error = capture("invalid", 0.0, &[], "F3DEX2");
    assert!(error.error.is_some());
    assert!(error.rows.is_empty());
    assert_eq!(error.diags[0].diag.line, 1);
}

#[test]
fn final_diagnostics_have_no_sequence() {
    let source = STARTER
        .lines()
        .filter(|l| !l.starts_with("gsDPSetRenderMode"))
        .collect::<Vec<_>>()
        .join("\n");
    let trace = capture(&source, 0.0, &[], "F3DEX2");
    let diagnostic = trace
        .diags
        .iter()
        .find(|d| d.diag.msg.contains("render mode"))
        .unwrap();
    assert_eq!(diagnostic.seq, None);
    assert!(diagnostic.pc.is_some());
    assert_eq!(diagnostic.diag.kind, "src");
}
