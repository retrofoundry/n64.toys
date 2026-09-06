//! wasm-bindgen entrypoint: canvas binding + asm -> process_dl -> present wiring.
//!
//! The JS-facing surface is per-item `#[cfg(target_arch = "wasm32")]`-gated so the pure helpers below
//! (`map_diags`/`should_present`) and their tests still build under native `cargo test`.

#[cfg(any(target_arch = "wasm32", test))]
mod inspect;

use fast3d::{Diagnostic, DlSummary};
use serde::{Deserialize, Serialize};

#[cfg(target_arch = "wasm32")]
use fast3d::{
    ClearPolicy, Hardware, Rdram, RdramImage, Renderer as Fast3dRenderer, RendererConfig,
};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use web_sys::HtmlCanvasElement;

// Reachable only from the wasm render path + tests (both cfg'd out on native), hence allow(dead_code).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct DiagOut {
    line: usize,
    /// "src" = 1-based source line; "addr" = RDRAM byte address; "none" = no location.
    kind: &'static str,
    msg: String,
    severity: &'static str,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct TextureDeclOut {
    name: String,
    width: u32,
    height: u32,
    format: String,
    line: usize,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct AnalysisOut {
    textures: Vec<TextureDeclOut>,
    references_time: bool,
    diags: Vec<DiagOut>,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Deserialize)]
struct TextureInputIn {
    name: String,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct RenderOut {
    presented: bool,
    diags: Vec<DiagOut>,
    /// Non-fatal runtime error (e.g. surface loss), distinct from the HLE diags.
    error: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn map_diags(diags: &[Diagnostic], source_map: &[(u32, usize)]) -> Vec<DiagOut> {
    diags
        .iter()
        .map(|d| {
            let (kind, line) = source_map
                .binary_search_by_key(&d.at, |&(addr, _)| u64::from(addr))
                .map(|index| ("src", source_map[index].1))
                .unwrap_or(("addr", d.at as usize));
            DiagOut {
                line,
                kind,
                msg: d.kind.to_string(),
                severity: match d.kind.severity() {
                    fast3d::Severity::Warn => "warn",
                    fast3d::Severity::Error => "error",
                },
            }
        })
        .collect()
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[cfg(any(target_arch = "wasm32", test))]
fn analysis_out(source: &str, microcode: n64_toys_asm::Microcode) -> AnalysisOut {
    let out = n64_toys_asm::analyze(source, microcode);
    AnalysisOut {
        textures: out
            .textures
            .into_iter()
            .map(|declaration| TextureDeclOut {
                name: declaration.name,
                width: declaration.width,
                height: declaration.height,
                format: declaration.format,
                line: declaration.line,
            })
            .collect(),
        references_time: out.references_time,
        diags: out
            .diagnostics
            .into_iter()
            .map(|diag| DiagOut {
                line: diag.line,
                kind: if diag.line == 0 { "none" } else { "src" },
                msg: diag.msg,
                severity: "error",
            })
            .collect(),
    }
}

#[cfg(any(target_arch = "wasm32", test))]
#[derive(Clone, Copy)]
struct MicrocodeTargets {
    assembler: n64_toys_asm::Microcode,
    renderer: fast3d::Microcode,
}

#[cfg(any(target_arch = "wasm32", test))]
fn parse_microcode(microcode: &str) -> Option<MicrocodeTargets> {
    match microcode {
        "F3DEX2" => Some(MicrocodeTargets {
            assembler: n64_toys_asm::Microcode::F3dex2,
            renderer: fast3d::Microcode::F3dex2,
        }),
        "F3D" => Some(MicrocodeTargets {
            assembler: n64_toys_asm::Microcode::F3d,
            renderer: fast3d::Microcode::F3d,
        }),
        _ => None,
    }
}

#[cfg(any(target_arch = "wasm32", test))]
fn map_analysis(source: &str, microcode: &str) -> AnalysisOut {
    let Some(targets) = parse_microcode(microcode) else {
        let mut out = analysis_out(source, n64_toys_asm::Microcode::default());
        out.diags.push(DiagOut {
            line: 0,
            kind: "none",
            msg: format!("unknown microcode: {microcode}"),
            severity: "error",
        });
        return out;
    };
    analysis_out(source, targets.assembler)
}

#[cfg(any(target_arch = "wasm32", test))]
#[derive(Debug)]
struct PreparedRender {
    image: n64_toys_asm::Image,
    microcode: fast3d::Microcode,
}

#[cfg(any(target_arch = "wasm32", test))]
fn prepare_render(
    source: &str,
    time: f32,
    textures: &[n64_toys_asm::TextureInput<'_>],
    targets: MicrocodeTargets,
) -> Result<PreparedRender, Vec<n64_toys_asm::Diag>> {
    let image = n64_toys_asm::assemble_at_with_textures(source, time, textures, targets.assembler)?;
    Ok(PreparedRender {
        image,
        microcode: targets.renderer,
    })
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn borrow_texture_inputs(inputs: &[TextureInputIn]) -> Vec<n64_toys_asm::TextureInput<'_>> {
    inputs
        .iter()
        .map(|input| n64_toys_asm::TextureInput {
            name: &input.name,
            rgba8: &input.rgba,
            width: input.width,
            height: input.height,
        })
        .collect()
}

/// Present iff the walk rasterized something and emitted zero ERROR-severity diagnostics
/// (WARN-only DLs still render).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn should_present(summary: &DlSummary) -> bool {
    summary.renderable && summary.errors == 0
}

#[cfg(target_arch = "wasm32")]
fn to_js<T: Serialize>(v: &T) -> JsValue {
    serde_wasm_bindgen::to_value(v).unwrap_or(JsValue::NULL)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = analyze)]
pub fn analyze_js(source: &str, microcode: &str) -> JsValue {
    to_js(&map_analysis(source, microcode))
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = inspect)]
pub fn inspect_js(source: &str, time: f32, textures: JsValue, microcode: &str) -> JsValue {
    let out = if parse_microcode(microcode).is_none() {
        inspect::capture(source, time, &[], microcode)
    } else {
        match serde_wasm_bindgen::from_value::<Vec<TextureInputIn>>(textures) {
            Ok(inputs) => {
                inspect::capture(source, time, &borrow_texture_inputs(&inputs), microcode)
            }
            Err(error) => {
                inspect::input_error(time, microcode, format!("invalid texture inputs: {error}"))
            }
        }
    };
    out.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap_or(JsValue::NULL)
}

#[cfg(any(target_arch = "wasm32", test))]
fn clear_prefix(summary: &DlSummary, prefix: bool) -> bool {
    prefix && !summary.renderable
}

#[cfg(any(target_arch = "wasm32", test))]
fn should_present_walk(summary: &DlSummary, prefix: bool) -> bool {
    prefix || should_present(summary)
}

/// The N64-machine boundary for web: an owned RDRAM image (the assembled DL).
#[cfg(target_arch = "wasm32")]
struct WebHardware {
    rdram: Vec<u8>,
}
#[cfg(target_arch = "wasm32")]
impl Hardware for WebHardware {
    fn rdram(&self) -> impl Rdram + '_ {
        RdramImage::new(&self.rdram)
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub struct Renderer {
    inner: Fast3dRenderer,
    hw: WebHardware,
    source_map: Vec<(u32, usize)>,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl Renderer {
    pub async fn init(canvas: HtmlCanvasElement) -> Result<Renderer, JsValue> {
        let (w, h) = (canvas.width(), canvas.height());
        let inner = Fast3dRenderer::new(
            wgpu::SurfaceTarget::Canvas(canvas),
            w,
            h,
            RendererConfig {
                resolution_multiplier: 1,
                sample_count: 1,
                present_mode: wgpu::PresentMode::AutoVsync,
                // None picks a deterministic non-sRGB format (avoids the sRGB washout).
                format: None,
                clear_policy: ClearPolicy::PerFrame,
                power_preference: wgpu::PowerPreference::default(),
            },
        )
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(Renderer {
            inner,
            hw: WebHardware { rdram: Vec::new() },
            source_map: Vec::new(),
        })
    }

    pub fn shutdown(self) {
        self.inner.shutdown();
    }

    /// Assemble the source with texture inputs, interpret it, and draw to the canvas.
    pub fn render(
        &mut self,
        source: &str,
        time: f32,
        textures: JsValue,
        microcode: &str,
    ) -> JsValue {
        self.render_commands(source, time, textures, microcode, None)
    }

    pub fn render_prefix(
        &mut self,
        source: &str,
        time: f32,
        textures: JsValue,
        microcode: &str,
        command_count: u32,
    ) -> JsValue {
        self.render_commands(source, time, textures, microcode, Some(command_count))
    }
}

#[cfg(target_arch = "wasm32")]
impl Renderer {
    fn render_commands(
        &mut self,
        source: &str,
        time: f32,
        textures: JsValue,
        microcode: &str,
        command_count: Option<u32>,
    ) -> JsValue {
        let Some(targets) = parse_microcode(microcode) else {
            return to_js(&RenderOut {
                presented: false,
                diags: Vec::new(),
                error: Some(format!("unknown microcode: {microcode}")),
            });
        };
        let inputs: Vec<TextureInputIn> = match serde_wasm_bindgen::from_value(textures) {
            Ok(inputs) => inputs,
            Err(error) => {
                return to_js(&RenderOut {
                    presented: false,
                    diags: Vec::new(),
                    error: Some(format!("invalid texture inputs: {error}")),
                });
            }
        };
        let borrowed = borrow_texture_inputs(&inputs);
        let prepared = match prepare_render(source, time, &borrowed, targets) {
            Ok(prepared) => prepared,
            Err(diags) => {
                return to_js(&RenderOut {
                    presented: false,
                    diags: diags
                        .into_iter()
                        .map(|d| DiagOut {
                            line: d.line,
                            kind: if d.line == 0 { "none" } else { "src" },
                            msg: d.msg,
                            severity: "error",
                        })
                        .collect(),
                    error: None,
                });
            }
        };
        let image = prepared.image;
        self.hw.rdram = image.rdram;
        self.source_map = image.source_map;

        let mut diags: Vec<Diagnostic> = Vec::new();
        self.inner.begin_frame();
        let summary = match command_count {
            Some(count) => self.inner.process_dl_prefix(
                &self.hw,
                u64::from(image.entry_addr),
                prepared.microcode,
                &mut diags,
                count,
            ),
            None => self.inner.process_dl(
                &self.hw,
                u64::from(image.entry_addr),
                prepared.microcode,
                &mut diags,
            ),
        };
        let diag_out = map_diags(&diags, &self.source_map);

        let clear = clear_prefix(&summary, command_count.is_some());
        if !should_present_walk(&summary, command_count.is_some()) {
            return to_js(&RenderOut {
                presented: false,
                diags: diag_out,
                error: None,
            });
        }

        if clear {
            self.inner.set_draw_hook(|frame| {
                let _pass = frame
                    .encoder
                    .begin_render_pass(&wgpu::RenderPassDescriptor {
                        label: Some("empty display list prefix"),
                        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                            view: frame.view,
                            depth_slice: None,
                            resolve_target: None,
                            ops: wgpu::Operations {
                                load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                                store: wgpu::StoreOp::Store,
                            },
                        })],
                        ..Default::default()
                    });
            });
        }
        let error = match self.inner.present(&self.hw) {
            Ok(()) => None,
            Err(e) => Some(format!("present: {e:?}")),
        };
        if clear {
            self.inner.take_render_hook();
        }
        to_js(&RenderOut {
            presented: error.is_none(),
            diags: diag_out,
            error,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fast3d::DiagKind;

    fn summary(renderable: bool, errors: u32, warns: u32) -> DlSummary {
        DlSummary {
            commands: 0,
            tris: 0,
            warns,
            errors,
            dropped_runs: 0,
            renderable,
            termination: fast3d::inspect::WalkTermination::End,
        }
    }

    #[test]
    fn empty_prefix_clears_even_after_an_error_but_ordinary_render_keeps_its_gate() {
        assert!(clear_prefix(&summary(false, 0, 0), true));
        assert!(clear_prefix(&summary(false, 1, 0), true));
        assert!(!clear_prefix(&summary(true, 0, 0), true));
        assert!(!clear_prefix(&summary(false, 0, 0), false));
        assert!(should_present_walk(&summary(false, 0, 0), true));
        assert!(should_present_walk(&summary(true, 1, 0), true));
        assert!(!should_present_walk(&summary(true, 1, 0), false));
    }

    #[test]
    fn should_present_gates_on_renderable_and_zero_errors() {
        assert!(
            should_present(&summary(true, 0, 0)),
            "renderable + no errors -> present"
        );
        assert!(
            should_present(&summary(true, 0, 5)),
            "warn-only DLs now render (loosened gate; old web blocked on ANY diag)"
        );
        assert!(
            !should_present(&summary(true, 1, 0)),
            "an error blocks even when renderable"
        );
        assert!(
            !should_present(&summary(false, 0, 0)),
            "nothing rasterized -> nothing to present"
        );
        assert!(
            !should_present(&summary(false, 3, 2)),
            "not renderable (errors present) -> no present"
        );
    }

    #[test]
    fn map_diags_resolves_source_lines_and_falls_back_to_addresses() {
        let diags = vec![
            Diagnostic {
                at: 0x20,
                kind: DiagKind::DrawBeforeCimg,
            },
            Diagnostic {
                at: 0x1234,
                kind: DiagKind::UnknownOpcode(0xAB),
            },
        ];
        let out = map_diags(&diags, &[(0x20, 7)]);
        assert_eq!(out.len(), 2);
        assert_eq!(
            (out[0].kind, out[0].line, out[0].msg.as_str()),
            ("src", 7, "draw before first CIMG")
        );
        assert_eq!(
            (out[1].kind, out[1].line, out[1].msg.as_str()),
            ("addr", 0x1234, "unknown opcode 0xAB")
        );
    }

    #[test]
    fn map_diags_points_missing_render_mode_at_starter_triangle() {
        let source = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../web-app/src/lib/docs/starter.n64"
        ))
        .lines()
        .filter(|line| !line.starts_with("gsDPSetRenderMode("))
        .collect::<Vec<_>>()
        .join("\n");
        let triangle_line = source
            .lines()
            .position(|line| line.starts_with("gsSP1Triangle("))
            .unwrap()
            + 1;
        let image = n64_toys_asm::assemble_at_with_textures(
            &source,
            0.0,
            &[],
            n64_toys_asm::Microcode::F3dex2,
        )
        .unwrap();
        let at = image
            .source_map
            .iter()
            .find(|&&(_, line)| line == triangle_line)
            .unwrap()
            .0;
        let out = map_diags(
            &[Diagnostic {
                at: u64::from(at),
                kind: DiagKind::RenderModeNeverSet,
            }],
            &image.source_map,
        );
        assert_eq!(out.len(), 1);
        assert_eq!((out[0].kind, out[0].line), ("src", triangle_line));
        assert_eq!(out[0].severity, "warn");
    }

    #[test]
    fn map_diags_preserves_severity() {
        let out = map_diags(
            &[
                Diagnostic {
                    at: 0,
                    kind: DiagKind::RenderModeNeverSet,
                },
                Diagnostic {
                    at: 8,
                    kind: DiagKind::UnknownOpcode(0xAB),
                },
            ],
            &[(0, 1)],
        );
        assert_eq!(out[0].severity, "warn");
        assert_eq!(out[1].severity, "error");
    }

    #[test]
    fn diag_kinds_discriminate_source_lines_from_addresses() {
        // Assembler diag: real source line -> "src"; line 0 (no location) -> "none".
        let out = map_analysis("this line does not parse\n", "F3DEX2");
        assert!(out
            .diags
            .iter()
            .all(|d| d.kind == "src" || d.kind == "none"));
        assert!(out.diags.iter().any(|d| d.kind == "src" && d.line == 1));

        let hle = vec![Diagnostic {
            at: 0x1234,
            kind: DiagKind::UnknownOpcode(0xAB),
        }];
        let mapped = map_diags(&hle, &[]);
        assert_eq!(mapped[0].kind, "addr");
        assert_eq!(mapped[0].line, 0x1234);
    }

    #[test]
    fn analysis_output_preserves_names_formats_and_diagnostics() {
        let out = map_analysis(
            "Texture grass = { 32, 16, RGBA16 }\ninvalid\nTexture mask = { 8, 8, IA8 }",
            "F3DEX2",
        );
        assert_eq!(out.textures[0].name, "grass");
        assert_eq!(out.textures[1].format, "IA8");
        assert!(!out.diags.is_empty());
        assert!(out.diags.iter().all(|diag| diag.severity == "error"));
    }

    #[test]
    fn analysis_reports_time_reference() {
        let out = map_analysis(
            "Mtx m = identity()\nupdate {\n  guRotate(m, time * 90, 0, 0, 1)\n}\n",
            "F3DEX2",
        );
        assert!(out.references_time);
    }

    #[test]
    fn preparation_selects_matching_assembler_and_renderer_targets() {
        let source = "gsSP1Triangle(0, 1, 2, 0)\ngsSPEndDisplayList()\n";
        for (name, opcode, renderer_microcode) in [
            ("F3DEX2", 0x05, fast3d::Microcode::F3dex2),
            ("F3D", 0xBF, fast3d::Microcode::F3d),
        ] {
            let prepared =
                prepare_render(source, 0.0, &[], parse_microcode(name).unwrap()).unwrap();
            assert_eq!(
                prepared.image.rdram[prepared.image.entry_addr as usize],
                opcode
            );
            assert_eq!(prepared.microcode, renderer_microcode);
        }
    }

    #[test]
    fn preparation_rejects_unknown_microcode_before_assembly() {
        for name in ["f3d", "", "F3DEX"] {
            assert!(parse_microcode(name).is_none());
        }
    }

    #[test]
    fn preparation_returns_assembly_diagnostics_for_known_microcode() {
        let diags = prepare_render(
            "this line does not parse\n",
            0.0,
            &[],
            parse_microcode("F3DEX2").unwrap(),
        )
        .unwrap_err();
        assert_eq!(diags[0].line, 1);
    }

    #[test]
    fn unknown_microcode_analysis_preserves_metadata_and_reports_no_location() {
        let out = map_analysis(
            "Texture grass = { 32, 16, RGBA16 }\nMtx m = identity()\nupdate {\n  guRotate(m, time * 90, 0, 0, 1)\n}\n",
            "f3d",
        );
        assert_eq!(out.textures.len(), 1);
        assert_eq!(out.textures[0].name, "grass");
        assert!(out.references_time);
        assert!(out
            .diags
            .iter()
            .any(|diag| diag.kind == "none" && diag.line == 0));
    }

    #[test]
    fn analysis_applies_target_specific_f3d_validation() {
        let source = "gsSP1Triangle(0, 1, 16, 0)\ngsSPEndDisplayList()\n";
        assert!(map_analysis(source, "F3DEX2").diags.is_empty());
        assert!(!map_analysis(source, "F3D").diags.is_empty());
    }

    #[test]
    fn starter_prepares_at_rest_and_in_motion_for_both_targets() {
        let source = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../web-app/src/lib/docs/starter.n64"
        ));
        for name in ["F3DEX2", "F3D"] {
            for time in [0.0, 1.37] {
                let prepared = prepare_render(source, time, &[], parse_microcode(name).unwrap())
                    .unwrap_or_else(|error| panic!("{name} starter at {time}: {error:?}"));
                assert!(prepared.image.entry_addr > 0);
            }
        }
    }

    #[test]
    fn owned_inputs_borrow_for_fast3d() {
        let inputs = vec![TextureInputIn {
            name: "grass".into(),
            rgba: vec![255, 0, 0, 255],
            width: 1,
            height: 1,
        }];
        let borrowed = borrow_texture_inputs(&inputs);
        assert_eq!(borrowed[0].name, "grass");
        assert_eq!(borrowed[0].rgba8, &[255, 0, 0, 255]);
    }
}
